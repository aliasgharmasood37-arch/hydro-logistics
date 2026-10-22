import {dl} from './dl.mjs';
for(const p of process.argv.slice(2)){
  const r=await dl(`/c/api/pin-codes/json/?filter_codes=${p}`);
  const pc=r.body?.delivery_codes?.[0]?.postal_code;
  console.log(p, pc? `${pc.district}/${pc.state_code} COD=${pc.cod} PRE=${pc.pre_paid} ODA=${pc.is_oda} remarks="${pc.remarks||''}"` : 'NOT LISTED');
}
