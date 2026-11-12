export function multiplier(a,b){if(a.r==='A'&&b.r==='A')return 2.5;if(a.s===b.s&&['K','Q'].includes(a.r)&&['K','Q'].includes(b.r)&&a.r!==b.r)return 2;if((a.r==='A'&&b.v===10)||(b.r==='A'&&a.v===10))return 1.8;if(a.r===b.r)return 1.6;if(a.s===b.s)return 1.4;if(Math.abs(a.v-b.v)===1)return 1.2;return 1;}
export const combo=c=>Math.round((c[0].v+c[1].v)*multiplier(...c));
