const ranks=['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const value=r=>r==='A'?11:['J','Q','K'].includes(r)?10:+r;
export function deal(rng=Math.random){const d=['♥','♦','♠','♣'].flatMap(s=>ranks.map(r=>({id:s+r,s,r,v:value(r)})));for(let i=d.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[d[i],d[j]]=[d[j],d[i]];}return [...d.filter(c=>'♥♦'.includes(c.s)).slice(0,7),...d.filter(c=>'♠♣'.includes(c.s)).slice(0,7)];}
