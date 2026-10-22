import {dl} from './dl.mjs';
for(const a of process.argv.slice(2)){
  const p=/^\d{11,}$/.test(a)?`/api/v1/packages/json/?waybill=${a}`:`/api/v1/packages/json/?ref_ids=${a}`;
  const r=await dl(p); const sh=r.body?.ShipmentData||[];
  console.log(`--- ${a}: ${sh.length} shipment(s)`);
  for(const s of sh){const S=s.Shipment;
    console.log(`   AWB ${S.AWB} ref=${S.ReferenceNo} ${S.Status?.Status}/${S.Status?.StatusType} ${S.Status?.Instructions} @ ${S.Status?.StatusDateTime}`);}
  if(!sh.length) console.log('   '+JSON.stringify(r.body).slice(0,150));
}
