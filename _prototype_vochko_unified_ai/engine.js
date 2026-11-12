export const OUTER_HP=12,INNER_HP=18,NEXUS_HP=80,MAX_ROUNDS=45;
export const shieldPct=p=>[0,40,70,100][p.inner.filter(v=>v<=0).length];
export function damage(p,l,n,pct=shieldPct(p)){if(n<=0)return;if(p.outer[l]>0)p.outer[l]=Math.max(0,p.outer[l]-n);else if(p.inner[l]>0)p.inner[l]=Math.max(0,p.inner[l]-n);else p.nexus=Math.max(0,p.nexus-Math.round(n*pct/100));}
export const damageStage=(p,l)=>p.outer[l]>0?'outer':p.inner[l]>0?'inner':'nexus';
