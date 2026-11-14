export const mean = values => values.reduce((sum,x)=>sum+x,0)/values.length;
export function interval(values,z=1.96) {
  if(!values.length)throw Error('Empty sample');
  const estimate=mean(values);
  const se=values.length>1?Math.sqrt(values.reduce((s,x)=>s+(x-estimate)**2,0)/(values.length-1)/values.length):0;
  return {estimate,low:estimate-z*se,high:estimate+z*se,n:values.length,se};
}
export function pairValues(rows,key) {
  const pairs=new Map();
  for(const row of rows){const list=pairs.get(row.pair)??[];list.push(typeof key==='function'?key(row):row[key]);pairs.set(row.pair,list);}
  for(const list of pairs.values())if(list.length!==2)throw Error('Incomplete mirror pair');
  return [...pairs.entries()].sort((a,b)=>a[0]-b[0]).map(([,values])=>mean(values));
}
export function pairedDelta(rows,reference,key='actorScore',z=1.96) {
  const ids=new Set(rows.map(r=>r.pair)),ref=reference.filter(r=>ids.has(r.pair));
  const a=pairValues(rows,key),b=pairValues(ref,key);
  if(a.length!==b.length)throw Error('Unpaired comparison');
  return interval(a.map((x,i)=>x-b[i]),z);
}
