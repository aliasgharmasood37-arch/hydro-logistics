import {dl} from './dl.mjs';
const r=await dl(`/api/v1/packages/json/?ref_ids=${process.argv[2]}`);
const s=r.body?.ShipmentData?.[0]?.Shipment; if(!s){console.log(JSON.stringify(r.body).slice(0,300));process.exit();}
const {Scans,...rest}=s; console.log(JSON.stringify(rest,null,1));
