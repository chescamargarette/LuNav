/** Reference information: NASA 2026 LEGS GOCO brochure; data are preliminary. */
export type LegsBand = 'X' | 'Ka';
export type LegsSite = {
  id: string;
  name: string;
  country: string;
  preciseCoordinatesVerified: false;
  operationalStatusVerified: false;
  planningNote: string;
};

export const LEGS_SITES: LegsSite[] = [
  {id:'legs1-white-sands',name:'LEGS #1 - White Sands Complex',country:'United States',preciseCoordinatesVerified:false,operationalStatusVerified:false,planningNote:'Planned government-owned contractor-operated ground site in New Mexico; commissioning and scheduling are not verified here.'},
  {id:'legs2-matjiesfontein',name:'LEGS #2 - Matjiesfontein',country:'South Africa',preciseCoordinatesVerified:false,operationalStatusVerified:false,planningNote:'Planned site in South Africa; commissioning and scheduling are not verified here.'},
  {id:'legs3-australia',name:'LEGS #3 - Western Australia (Geraldton TBC)',country:'Australia',preciseCoordinatesVerified:false,operationalStatusVerified:false,planningNote:'Exact Australian site was TBC in the cited NASA brochure; commissioning and scheduling are not verified here.'},
];

export const LEGS_RETURN_BANDS: Record<LegsBand, {
  downlinkMinMHz:number;downlinkMaxMHz:number;groundGtDbK:number;defaultMHz:number;
}> = {
  X:  {downlinkMinMHz:8400,downlinkMaxMHz:8500,groundGtDbK:39,defaultMHz:8450},
  Ka: {downlinkMinMHz:25500,downlinkMaxMHz:27000,groundGtDbK:47.5,defaultMHz:26250},
};

export const LEGS_FORWARD_BANDS: Record<LegsBand, {
  uplinkMinMHz:number;uplinkMaxMHz:number;groundMinEirpDbw:number;defaultMHz:number;
}> = {
  X:  {uplinkMinMHz:7145,uplinkMaxMHz:7235,groundMinEirpDbw:86,defaultMHz:7180},
  Ka: {uplinkMinMHz:22550,uplinkMaxMHz:23150,groundMinEirpDbw:89,defaultMHz:22850},
};

export type LegsForwardInput = {
  direction:'forward';
  siteId:string;
  band:LegsBand;
  frequencyMHz:number;
  lunarToGroundRangeKm:number; // Assumed until site ephemerides are integrated.
  spacecraftReceiverGainDbi:number;
  spacecraftReceiverSensitivityDbm:number; // A rover receiver input (or receiver sensitivity from modem model).
  totalPropagationAndPointingLossDb:number;
  requiredPowerMarginDb?:number;
};

export const LEGS_REFERENCE_URL = 'https://explorers.larc.nasa.gov/APSMEX26/SMEX/pdf_files/Prog05d_LEGS_Brochure_r25-1.pdf';

export type LegsLinkInput = {
  siteId:string;
  band:LegsBand;
  frequencyMHz:number;
  lunarToGroundRangeKm:number; // Assumed range until precise station Moon ephemerides are integrated.
  spacecraftEirpDbw:number;   // Transmitter output + transmit antenna gain - spacecraft feed losses.
  bitRateBps:number;
  totalPropagationAndPointingLossDb:number;
  requiredEbN0Db:number;      // Depends on modem, coding and target BER; user-specified.
  groundImplementationLossDb?:number; // Brochure indicates <=2 dB; 2 dB conservative default.
};

export function computeLegsReturnLink(x:LegsLinkInput) {
  if (!LEGS_SITES.some(s=>s.id===x.siteId)) throw new Error('Unknown LEGS site');
  if (!Object.prototype.hasOwnProperty.call(LEGS_RETURN_BANDS,x.band)) throw new Error('Unknown RF band');
  const b = LEGS_RETURN_BANDS[x.band];
  const requiredFinite=[x.frequencyMHz,x.lunarToGroundRangeKm,x.spacecraftEirpDbw,x.bitRateBps,
    x.totalPropagationAndPointingLossDb,x.requiredEbN0Db,x.groundImplementationLossDb??2];
  if(requiredFinite.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('All link inputs must be finite');
  if(x.frequencyMHz<b.downlinkMinMHz||x.frequencyMHz>b.downlinkMaxMHz)throw new Error('Frequency is outside LEGS return band');
  if(x.lunarToGroundRangeKm<=0||x.bitRateBps<=0||x.totalPropagationAndPointingLossDb<0
    ||(x.groundImplementationLossDb??2)<0)throw new Error('Invalid physical input or loss');
  const fsplDb=92.45+20*Math.log10(x.lunarToGroundRangeKm)+20*Math.log10(x.frequencyMHz/1000);
  // Boltzmann 10*log10(k) ~= -228.6 dBW/K/Hz; LEGS publishes G/T, not a receiver sensitivity in dBm.
  const cn0DbHz=x.spacecraftEirpDbw-fsplDb-x.totalPropagationAndPointingLossDb+b.groundGtDbK+228.6;
  const ebN0BeforeImplementationDb=cn0DbHz-10*Math.log10(x.bitRateBps);
  const implementationDb=x.groundImplementationLossDb??2;
  const effectiveEbN0Db=ebN0BeforeImplementationDb-implementationDb;
  const marginDb=effectiveEbN0Db-x.requiredEbN0Db;
  return {
    siteId:x.siteId,band:x.band,frequencyMHz:x.frequencyMHz,
    rangeSource:'user_assumed',groundGtDbK:b.groundGtDbK,
    freeSpacePathLossDb:fsplDb,
    carrierToNoiseDensityDbHz:cn0DbHz,
    ebN0BeforeImplementationDb,effectiveEbN0Db,
    requiredEbN0Db:x.requiredEbN0Db,
    linkMarginDb:marginDb,
    budgetAboveThreshold:marginDb>=0,
    actualEndToEndAvailability:null,
    checksNotPerformed:['Terrain-corrected surface-to-specific-station line-of-sight',
      'Station Moon elevation and local Earth horizon',
      'LEGS station commissioning, scheduling and antenna access',
      'Exact time-varying lunar-to-ground-station range',
      'Spacecraft antenna pointing, beam pattern, modem/BER verification'],
    dataQuality:'Preliminary LEGS specifications plus explicitly assumed spacecraft parameters and distance',
    sourceUrl:LEGS_REFERENCE_URL,
  };
}

/** Ground LEGS to spacecraft receiver: this is the forward/uplink direction. */
export function computeLegsForwardLink(x:LegsForwardInput) {
  if (!LEGS_SITES.some(s=>s.id===x.siteId)) throw new Error('Unknown LEGS site');
  if (!Object.prototype.hasOwnProperty.call(LEGS_FORWARD_BANDS,x.band)) throw new Error('Unknown RF band');
  const b = LEGS_FORWARD_BANDS[x.band];
  const requiredFinite=[x.frequencyMHz,x.lunarToGroundRangeKm,x.spacecraftReceiverGainDbi,
    x.spacecraftReceiverSensitivityDbm,x.totalPropagationAndPointingLossDb,x.requiredPowerMarginDb??0];
  if(requiredFinite.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('All link inputs must be finite');
  if(x.frequencyMHz<b.uplinkMinMHz||x.frequencyMHz>b.uplinkMaxMHz)throw new Error('Frequency is outside LEGS forward band');
  if(x.lunarToGroundRangeKm<=0||x.totalPropagationAndPointingLossDb<0)throw new Error('Invalid physical input or loss');
  const fsplDb=92.45+20*Math.log10(x.lunarToGroundRangeKm)+20*Math.log10(x.frequencyMHz/1000);
  const receivedPowerDbm=b.groundMinEirpDbw+30-fsplDb-x.totalPropagationAndPointingLossDb+x.spacecraftReceiverGainDbi;
  const powerMarginDb=receivedPowerDbm-x.spacecraftReceiverSensitivityDbm;
  return {
    siteId:x.siteId,direction:'forward' as const,band:x.band,frequencyMHz:x.frequencyMHz,
    rangeSource:'user_assumed',groundReferenceEirpDbw:b.groundMinEirpDbw,
    freeSpacePathLossDb:fsplDb,
    roverReceivedPowerDbm:receivedPowerDbm,
    roverReceiverSensitivityDbm:x.spacecraftReceiverSensitivityDbm,
    powerMarginDb,minimumMarginDb:x.requiredPowerMarginDb??0,
    budgetAboveThreshold:powerMarginDb>=(x.requiredPowerMarginDb??0),
    actualEndToEndAvailability:null,
    checksNotPerformed:['Terrain-corrected lunar receiver visibility',
      'Station Moon elevation and local Earth horizon','LEGS station commissioning, scheduling and antenna access',
      'Exact time-varying lunar-to-ground-station range','Receiver pointing and actual modulation/coding requirements'],
    dataQuality:'Preliminary NASA LEGS minimum forward EIRP plus assumed rover receiver gain/sensitivity and range',
    sourceUrl:LEGS_REFERENCE_URL,
  };
}
