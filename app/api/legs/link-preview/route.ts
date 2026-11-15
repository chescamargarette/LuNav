import { computeLegsForwardLink, computeLegsReturnLink, type LegsForwardInput, type LegsLinkInput } from '../../../../utils/legsReference';

/** Fixed-assumption return-link PREVIEW, not visibility/operations verification. */
export async function POST(req: Request) {
  try {
    const body = await req.text();
    if(body.length>5000) return Response.json({error:'Request body too large'}, {status:413});
    const x=JSON.parse(body) as LegsLinkInput | LegsForwardInput;
    const forward='direction' in x && x.direction==='forward';
    return Response.json({application:'LuNAv',type:forward?'LEGS_forward_link_preview':'LEGS_return_link_preview',
      result:forward?computeLegsForwardLink(x as LegsForwardInput):computeLegsReturnLink(x as LegsLinkInput),
      status:'preliminary_budget_only'});
  } catch(err) {
    return Response.json({error:err instanceof Error?err.message:String(err)}, {status:422});
  }
}
