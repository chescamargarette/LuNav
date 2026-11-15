import { CURRENT_LOLA_DEM, listMissionReferences } from '../../../utils/missionReferences';
import { DOCUMENTED_LEGS_COORDINATES } from '../../../utils/legsGeometry';
import { LEGS_REFERENCE_URL, LEGS_RETURN_BANDS, LEGS_FORWARD_BANDS, LEGS_SITES } from '../../../utils/legsReference';

export async function GET() {
  return Response.json({
    application: 'LuNAv',
    referenceType: 'historical_mission_locations_and_preliminary_LEGS_capabilities',
    missions: listMissionReferences(),
    currentLolaDem: CURRENT_LOLA_DEM,
    legs: {
      sites: LEGS_SITES.map(s=>({...s,approximateGeometryReference:DOCUMENTED_LEGS_COORDINATES[s.id]??null})),
      returnBands: LEGS_RETURN_BANDS,
      forwardBands: LEGS_FORWARD_BANDS,
      specStatus: 'preliminary_not_operationally_confirmed',
      sourceUrl: LEGS_REFERENCE_URL,
    },
    caveats: [
      'Unknown historical mission spacecraft values are null, never synthetic numbers.',
      'Selecting a historical site does not imply its horizon has been precomputed or lies inside the downloaded DEM.',
      'LEGS specifications can be used to model a hypothetical direct-to-Earth link; LEGS was not necessarily the historical mission network.',
      'Chandrayaan-3 rover requires rover-to-lander plus lander-to-Earth hops rather than direct LEGS rover return.',
    ],
  });
}
