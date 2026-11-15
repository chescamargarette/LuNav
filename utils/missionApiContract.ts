/** Shared frontend-safe LuNAv Phase 3B API types. Use import type from client components. */
import type {HorizonProfile,SpacecraftSpecs} from './terrainAnalysis';
import type {LegsScenario} from './missionDynamics';
export type SiteSelection={id:string;name?:string;lat:number;lon:number;horizonProfile?:HorizonProfile};
export type MissionCompareRequest={
  sites?:SiteSelection[];missionReferenceId?:string;
  startUtc:string;endUtc:string;timezone?:string;stepHours?:number;
  terrainMode?:'ideal_horizon'|'terrain_aware';
  spacecraft?:SpacecraftSpecs;legsScenario?:LegsScenario;
};
export type MissionCompareSite={
  id:string;name:string;lat:number;lon:number;terrainCatalogId:string|null;
  model:'ideal_horizon'|'terrain_aware';
  terrain:{source:HorizonProfile['provenance']|null;siteElevationM:number|null;localSlopeDeg:number|null;
    footprintSurfaceAreaM2:number|null;footprintProjectedAreaM2:number|null;footprintRadiusM:number|null;
    terrainSearchRadiusKm:number|null;profile:unknown};
  timeline:{timeUtc:string;sunAzimuthDeg:number;sunElevationDeg:number;earthAzimuthDeg:number;earthElevationDeg:number;
    sunHorizonDeg:number;earthHorizonDeg:number;sunClearanceDeg:number;earthClearanceDeg:number;
    sunVisible:boolean;earthVisible:boolean;estimatedSolarPowerW:number|null;
    linkMarginDb:number|null;linkFeasible:boolean|null}[];
  availability:{evaluatedHours:number;requestedHours:number;coveragePercent:number;sunlightPercent:number;earthLosPercent:number;
    simultaneousSunEarthPercent:number;longestDarknessHours:number;longestEarthBlackoutHours:number;
    linkAvailabilityPercent:number|null};
  energySimulation:{timeline:{timeUtc:string;stateOfChargePercent:number;batteryWh:number;solarPowerW:number;loadW:number;powerShortfallW:number}[];
    finalStateOfChargePercent:number;minimumStateOfChargePercent:number;firstPowerShortfallUtc:string|null;
    powerSustained:boolean;unservedLoadWh:number;model:string}|null;
  legsAnalysis:{budget:{linkMarginDb?:number;powerMarginDb?:number;budgetAboveThreshold:boolean};
    actualContactAvailabilityPercent:null;actualStationVisibility:null;
    candidateTimeline:{timeUtc:string;lunarEarthCenterVisible:boolean;linkBudgetAboveThreshold:boolean;candidateOnly:boolean;
      actualLEGSContactAvailable:null}[]}|null;
  legsNetworkAnalysis:{
    model:string;groundMinimumElevationDeg:number;modeledNetworkContactPercent:number|null;
    modeledNetworkContactHours:number|null;modeledStationCount:number;unmodeledStationCount:number;
    modeledNetworkWindows:{startUtc:string;endUtc:string;durationHours:number}[];
    stationResults:{stationId:string;status:string;modeledContactPercent:number|null;reason:string;
      samples:{timeUtc:string;lunarElevationDeg:number;lunarHorizonDeg:number;
        lunarClearanceDeg:number;groundMoonElevationDeg:number;groundClearanceDeg:number;
        slantRangeKm:number;linkMarginDb:number;geometricLinkAvailable:boolean;operationalContactAvailable:null}[];
      windows:{startUtc:string;endUtc:string;durationHours:number}[]}[];
    networkUnionSampled:{timeUtc:string;availableStations:string[];bestStationId:string|null;bestMarginDb:number|null}[];
    actualOperationalAvailability:null;warnings:string[]}|null;
  warnings:string[];assumptions:{dataQuality:string};suitability:string;
};
export type MissionCompareResponse={
  application:'LuNav';apiVersion:string;source:string;requestedStartUtc:string;requestedEndUtc:string;
  displayTimezone:string;stepHours:number;ephemerisSamplingMethod:string;
  missionReference:{id:string;label:string;landingDateUtc:string;published:Record<string,unknown>;
    warnings:string[];sourceUrls:string[];note:string}|null;
  sites:MissionCompareSite[];warnings:string[];
};
