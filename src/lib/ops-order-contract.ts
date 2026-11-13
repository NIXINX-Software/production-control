import type {OpsSite,OpsUnit} from './ops-contract';
export const OPS_APPROVAL_AREAS=['compras','inventarios','cocina','finanzas'] as const;
export type OpsApprovalArea=typeof OPS_APPROVAL_AREAS[number];
export type OpsOrderStatus='draft'|'pending_owner'|'returned'|'approved'|'closed';
export type OpsSupplyStatus='pending'|'partial'|'complete';
export type OpsOrderLine={
 id:string;productId:string;productName:string;unit:OpsUnit;quantity:number;
 requestedBaseAmount:number;unitCostCents:number|null;estimateCents:number|null;
 suppliedBaseAmount:number;supplyStatus:OpsSupplyStatus;note?:string;
 requestedCents?:number;lineApprovals?:Partial<Record<OpsApprovalArea,OpsOrderApproval>>;
 ownerAccepted?:boolean;ownerLineComment?:string;
};
export type OpsOrderApproval={name:string;at:string;revision:number};
export type OpsOrder={
 id:string;siteId:OpsSite;folio:string;status:OpsOrderStatus;createdAt?:unknown;updatedAt?:unknown;
 revision:number;from:string;to:string;requiredDate?:string;lines:OpsOrderLine[];
 estimatedSubtotalCents:number|null;requestedBudgetCents:number;minPercent:number;maxPercent:number;
 minBudgetCents:number;maxBudgetCents:number;
 approvals:Partial<Record<OpsApprovalArea,OpsOrderApproval>>;
 ownerComment?:string;ownerApprovedAt?:unknown;ownerApprovedBy?:string;
 closedAt?:unknown;closeReason?:string;closeResult?:'complete'|'with_pending';createdBy?:string;
};
export type OpsCostReportRow={
 productId:string;productName:string;unit:'kg'|'l'|'unit';
 quantity:number;amountCents:number;avgCostCents:number|null;lines:number;unpricedLines:number;
};
export function orderEstimate(lines:Pick<OpsOrderLine,'estimateCents'>[]):number|null{
 return lines.length&&lines.every(l=>l.estimateCents!==null)?
   lines.reduce((sum,l)=>sum+(l.estimateCents??0),0):null;
}
export function supplyStatusFor(quantity:number,fulfilled:number):OpsSupplyStatus{
 return fulfilled<=0?'pending':fulfilled>=quantity?'complete':'partial';
}
export function effectiveBudgetRange(amountCents:number,minPercent:number,maxPercent:number){
 return {minBudgetCents:Math.round(amountCents*minPercent/100),maxBudgetCents:Math.round(amountCents*maxPercent/100)};
}
