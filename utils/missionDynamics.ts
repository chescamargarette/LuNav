/** Explicitly simplified spacecraft power simulation and candidate LEGS budgets. */
import type {EphemerisRow,SpacecraftSpecs} from './terrainAnalysis';
import {computeLegsForwardLink,computeLegsReturnLink,type LegsBand} from './legsReference';
import type {LegsGeometryOptions} from './legsGeometry';
export type LegsScenario = {
  geometry?:LegsGeometryOptions;
  siteId:string;band:LegsBand;direction:'return'|'forward';frequencyMHz:number;
  assumedRangeKm:number;propagationAndPointingLossDb:number;
  spacecraftEirpDbw?:number;bitRateBps?:number;requiredEbN0Db?:number;
  implementationLossDb?:number;roverReceiverGainDbi?:number;
  roverReceiverSensitivityDbm?:number;minimumPowerMarginDb?:number;
};
export function batteryTimeline(rows:EphemerisRow[], s:SpacecraftSpecs) {
  if(s.batteryCapacityWh===undefined ||s.averageElectricalLoadW===undefined||
    !rows.every(r=>r.estimatedSolarPowerW!==null))return null;
  const capacity=s.batteryCapacityWh, load=s.averageElectricalLoadW;
  const initialPct=s.initialBatterySocPercent??100;
  const chargeEff=s.batteryChargeEfficiency??0.85, dischargeEff=s.batteryDischargeEfficiency??0.95;
  const reservePct=s.batteryReservePercent??0;
  if(!Number.isFinite(capacity)||capacity<=0||!Number.isFinite(load)||load<0 ||
     [initialPct,reservePct].some(x=>x<0||x>100)||
     [chargeEff,dischargeEff].some(x=>!Number.isFinite(x)||x<=0||x>1))
    throw new Error('Battery configuration outside supported ranges');
  let stored=capacity*initialPct/100, lostWh=0, curtailedWh=0, firstInsufficientUtc:string|null=null;
  const minStored=capacity*reservePct/100;
  const powerTimeline=[{timeUtc:rows[0].timeUtc,batteryWh:stored,stateOfChargePercent:100*stored/capacity,
    solarPowerW:rows[0].estimatedSolarPowerW!,loadW:load,powerShortfallW:0}];
  for(let i=0;i<rows.length-1;i++){
    const a=rows[i],b=rows[i+1],dt=(Date.parse(b.timeUtc)-Date.parse(a.timeUtc))/3600000;
    if(dt<=0)throw new Error('Power timeline timestamps not increasing');
    // Trapezoid approximation; boundaries near shadow events require finer sampling.
    const solar=Math.max(0,((a.estimatedSolarPowerW??0)+(b.estimatedSolarPowerW??0))/2);
    const net=solar-load;
    let shortfall=0;
    if(net>=0){const storedBefore=stored;stored=Math.min(capacity,stored+net*dt*chargeEff);
      curtailedWh+=Math.max(0,net*dt*chargeEff-(stored-storedBefore));}
    else {const demandWh=-net*dt/dischargeEff;
      const usable=Math.max(0,stored-minStored);
      if(demandWh>usable){
        shortfall=(demandWh-usable)*dischargeEff/dt;
        lostWh+=(demandWh-usable)*dischargeEff;
        if(firstInsufficientUtc===null){
          const fraction=demandWh===0?1:usable/demandWh;
          firstInsufficientUtc=new Date(Date.parse(a.timeUtc)+fraction*dt*3600000).toISOString();
        }
      }
      stored=Math.max(minStored,stored-demandWh);
    }
    powerTimeline.push({timeUtc:b.timeUtc,batteryWh:stored,stateOfChargePercent:100*stored/capacity,
      solarPowerW:b.estimatedSolarPowerW!,loadW:load,powerShortfallW:shortfall});
  }
  return {timeline:powerTimeline,finalStateOfChargePercent:100*stored/capacity,
    minimumStateOfChargePercent:Math.min(...powerTimeline.map(x=>x.stateOfChargePercent)),
    firstPowerShortfallUtc:firstInsufficientUtc,unservedLoadWh:lostWh,curtailedChargeWh:curtailedWh,
    powerSustained:lostWh<1e-9,model:'fixed load, fixed panel, hourly sample trapezoid, charge/discharge efficiency; no thermal/degradation/operational modes',
    initialSocPercent:initialPct,chargeEfficiency:chargeEff,dischargeEfficiency:dischargeEff,
    reservePercent:reservePct};
}
export function legsCandidateTimeline(rows:EphemerisRow[], scenario:LegsScenario){
  let budget;
  if(scenario.direction==='return'){
    if(scenario.spacecraftEirpDbw===undefined||scenario.bitRateBps===undefined||scenario.requiredEbN0Db===undefined)
      throw new Error('LEGS return requires spacecraftEirpDbw, bitRateBps, and requiredEbN0Db');
    budget=computeLegsReturnLink({siteId:scenario.siteId,band:scenario.band,frequencyMHz:scenario.frequencyMHz,
      lunarToGroundRangeKm:scenario.assumedRangeKm,spacecraftEirpDbw:scenario.spacecraftEirpDbw,
      bitRateBps:scenario.bitRateBps,totalPropagationAndPointingLossDb:scenario.propagationAndPointingLossDb,
      requiredEbN0Db:scenario.requiredEbN0Db,groundImplementationLossDb:scenario.implementationLossDb});
  }else{
    if(scenario.roverReceiverGainDbi===undefined||scenario.roverReceiverSensitivityDbm===undefined)
      throw new Error('LEGS forward requires roverReceiverGainDbi and roverReceiverSensitivityDbm');
    budget=computeLegsForwardLink({direction:'forward',siteId:scenario.siteId,band:scenario.band,
      frequencyMHz:scenario.frequencyMHz,lunarToGroundRangeKm:scenario.assumedRangeKm,
      spacecraftReceiverGainDbi:scenario.roverReceiverGainDbi,
      spacecraftReceiverSensitivityDbm:scenario.roverReceiverSensitivityDbm,
      totalPropagationAndPointingLossDb:scenario.propagationAndPointingLossDb,
      requiredPowerMarginDb:scenario.minimumPowerMarginDb});
  }
  return {scenario,budget,candidateTimeline:rows.map(r=>({timeUtc:r.timeUtc,
    lunarEarthCenterVisible:r.earthVisible,linkBudgetAboveThreshold:budget.budgetAboveThreshold,
    // A necessary condition, NOT a station-specific availability prediction.
    candidateOnly:r.earthVisible && budget.budgetAboveThreshold,
    actualLEGSContactAvailable:null})),
    actualStationVisibility:null,actualContactAvailabilityPercent:null,
    caveats:['Earth-center lunar horizon clearance is not a specific LEGS station sight line.',
      'All candidate windows are conditional on station elevation, coordinates, schedule, commissioning and real range.',
      'Distance and spacecraft parameters are assumptions, not recovered historical mission hardware.']};
}
