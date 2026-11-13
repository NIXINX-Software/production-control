import type {Firestore} from 'firebase-admin/firestore';
import {FieldValue} from 'firebase-admin/firestore';
import type {OpsSite} from './ops-contract';

/** Immutable, human-readable business folio; underlying Firestore document ID remains unchanged.
 * One yearly counter for each site/process; transactions prevent concurrent duplicates.
 * Date is the creation date, not an editable purchase date.
 */
export async function nextOpsFolio(store:Firestore,site:OpsSite,kind:string,at=new Date()):Promise<string>{
  if(!/^[A-Z]{2,5}$/.test(kind))throw new Error('INVALID_FOLIO_KIND');
  const year=at.getUTCFullYear();
  const day=[year,String(at.getUTCMonth()+1).padStart(2,'0'),String(at.getUTCDate()).padStart(2,'0')].join('');
  const ref=store.collection('ops_folio_sequences').doc(site+'_'+kind+'_'+year);
  const count=await store.runTransaction(async tx=>{
    const doc=await tx.get(ref);
    const value=Number(doc.data()?.lastNumber??0);
    if(!Number.isSafeInteger(value)||value<0||value>=999999)throw new Error('FOLIO_SEQUENCE_EXHAUSTED');
    const next=value+1;
    tx.set(ref,{siteId:site,kind,year,lastNumber:next,updatedAt:FieldValue.serverTimestamp()},{merge:true});
    return next;
  });
  return site.toUpperCase()+'-'+kind+'-'+day+'-'+String(count).padStart(6,'0');
}
