import {requireUser} from '../_shared/auth.ts';
import {json,err,cors,HttpError} from '../_shared/cors.ts';
import {sql} from '../_shared/db.ts';
import {broadcastState} from '../_shared/realtime.ts';
import {validateTurn} from '../../../shared/validation.js';

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  try{
    const user=await requireUser(req),body=await req.json();
    const {matchId,round,placements,coreCardId}=body??{};
    if(Object.keys(body??{}).some(k=>!['matchId','round','placements','coreCardId'].includes(k)))throw new HttpError('Передавай только карты подготовки');
    const result=await sql.begin(async tx=>{
      const [m]=await tx`select * from private.matches where id = ${matchId} for update`;
      if(!m)throw new HttpError('match not found',404);
      const seat=user.id===m.player1_id?1:user.id===m.player2_id?2:0;
      if(!seat||(m.state?.botMatch&&seat!==1))throw new HttpError('not a participant',403);
      if(m.status!=='planning'||m.round!==round)throw new HttpError('stale round or phase',409);
      const st=m.state;
      if(st.rules?.nexusCoreEnabled!==true)throw new HttpError('Ядро выключено для этого матча',409);
      if(coreCardId&&st.coreExclusions?.[seat]?.includes(coreCardId))throw new HttpError('Эта карта исключена из текущей раздачи',400);
      const turn={placements,fortifyLane:null,...(coreCardId!=null?{coreCardId}:{})};
      const check=validateTurn(st.hands[String(seat)],turn,{nexusCoreEnabled:true,requireCore:false});
      if(!check.ok)throw new HttpError(check.error,400);
      const normalized=[...placements].sort((a,b)=>a.lane-b.lane);
      st.corePreparations??={};
      const old=st.corePreparations[seat];
      if(old&&JSON.stringify(old.placements)!==JSON.stringify(normalized))throw new HttpError('Расстановка уже подтверждена для Ядра',409);
      if(old?.coreCardId&&coreCardId!==old.coreCardId)throw new HttpError('Карта Ядра уже подтверждена',409);
      if(!old&&coreCardId!=null)throw new HttpError('Сначала заверши этап расстановки',409);
      const preparation={round,placements:normalized,coreCardId:coreCardId??null,phase:coreCardId?'core_selected':'nexus_core'};
      if(old&&JSON.stringify(old)===JSON.stringify(preparation))return {accepted:true,preparation,version:Number(m.version)};
      st.corePreparations[seat]=preparation;
      const [updated]=await tx`update private.matches set state = ${sql.json(st)}, version = version + 1, updated_at = now() where id = ${m.id} returning version`;
      return {accepted:true,preparation,version:Number(updated.version)};
    });
    // Only the version is broadcast; the opponent never sees a private draft.
    await broadcastState(matchId,result.version,'preparation');
    return json(result);
  }catch(e){return err(e?.message??'error',e instanceof HttpError?e.status:500);}
});
