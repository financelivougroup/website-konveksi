import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

// Real PaymentModal handlers with isolated hooks and services: no browser/DB writes.
const result = await build({
  stdin: { contents: `export { PaymentModal } from './src/components/Modals/PaymentModal'; export * as state from 'payment-test-state';`, resolveDir: process.cwd(), loader: 'tsx' },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  alias: { '@': `${process.cwd()}/src` }, external: ['react/jsx-runtime'],
  plugins: [{ name: 'payment-test', setup(build) {
    build.onResolve({ filter: /^(react|payment-test-state|lucide-react|@\/components\/ui\/.*|@\/contexts\/AuthContext|@\/services\/.*|@\/components\/Modals\/PermanentDeleteDialog)$/ }, args => ({ path: args.path, namespace: 'payment-test' }))
    build.onLoad({ filter: /.*/, namespace: 'payment-test' }, ({ path }) => {
      if (path === 'payment-test-state') return { contents: `
        export let hooks = [], cursor = 0, effects = [], calls = [], role = 'owner', payments = [], proofsPerPayment = 1;
        export function setProofsPerPayment(count) { proofsPerPayment = count; }
        export function reset(nextRole, nextPayments) { hooks = []; cursor = 0; effects = []; calls = []; role = nextRole; payments = nextPayments; proofsPerPayment = 1; }
        export function begin() { cursor = 0; }
        export function useState(initial) { const i=cursor++; if (!(i in hooks)) hooks[i] = typeof initial === 'function' ? initial() : initial; return [hooks[i], v => {hooks[i] = typeof v === 'function' ? v(hooks[i]) : v;}]; }
        export function useRef(value) { const i=cursor++; if (!(i in hooks)) hooks[i]={current:value}; return hooks[i]; }
        export function useCallback(fn) { return fn; }
        export function useMemo(fn) { return fn(); }
        export function useEffect(fn) { cursor++; if (!effects.length && !calls.length) effects.push(fn); }
        export function flush() { const list=effects; effects=[]; list.forEach(fn=>fn()); }
        export async function fetchPaymentsByInvoiceId(id) { calls.push({ op:'fetchPayments', id }); return {data:payments,error:null}; }
        export async function fetchFilesByPaymentIds(ids) { calls.push({ op:'fetchFiles', ids }); return {data:ids.flatMap(id=>Array.from({length:proofsPerPayment},(_,index)=>({id:'proof-'+id+'-'+index,paymentId:id,filePath:'proof/'+id+'/'+index,fileName:'proof.pdf',fileUrl:'https://test.invalid/proof'}))),error:null}; }
        export async function removeProof(...args) { calls.push({op:'removeProof',args}); return {error:null,cleanupError:new Error('offline')}; }
        export async function write(...args) { calls.push({op:'write',args}); return {data:null,error:null}; }
      ` }
      if (path === 'react') return { contents: `export {useState,useRef,useCallback,useMemo,useEffect} from 'payment-test-state';` }
      if (path === '@/contexts/AuthContext') return { contents: `import {role} from 'payment-test-state'; export function useAuth(){return {profile:{role}}}` }
      if (path === '@/services/invoicePayments') return { contents: `export {fetchPaymentsByInvoiceId,write as createPayment,write as removePayment,write as updatePayment} from 'payment-test-state';` }
      if (path === '@/services/invoicePaymentFiles') return { contents: `export {fetchFilesByPaymentIds,write as createPaymentFileRecord,removeProof as removePaymentFile,write as removePaymentProofObject,write as uploadPaymentProof} from 'payment-test-state';` }
      if (path === '@/services/invoices') return { contents: `export {write as updateInvoice,write as updateWorkOrderInvoiceStatus} from 'payment-test-state';` }
      const names = {
        'lucide-react': ['Paperclip','Plus','Trash2','TriangleAlert','Undo2'],
        '@/components/ui/dialog': ['Dialog','DialogContent','DialogDescription','DialogFooter','DialogHeader','DialogTitle'],
        '@/components/ui/alert-dialog': ['AlertDialog','AlertDialogAction','AlertDialogCancel','AlertDialogContent','AlertDialogDescription','AlertDialogFooter','AlertDialogHeader','AlertDialogTitle'],
        '@/components/ui/alert': ['Alert','AlertDescription','AlertTitle'],
        '@/components/ui/button': ['Button'], '@/components/ui/input': ['Input'], '@/components/ui/label': ['Label'],
        '@/components/ui/radio-group': ['RadioGroup','RadioGroupItem'],
        '@/components/Modals/PermanentDeleteDialog': ['PermanentDeleteDialog'],
      }[path]
      return {contents:names.map(name=>`export const ${name}='${name}';`).join('\n')}
    })
  } }],
})
const { PaymentModal, state } = await import(`data:text/javascript,${encodeURIComponent(result.outputFiles[0].text.replaceAll('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime'))))}`)
const tick = () => new Promise(resolve=>setImmediate(resolve))
function nodes(node) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(nodes); return [node,...nodes(node.props?.children)] }
const find = (tree,type) => nodes(tree).find(node=>node.type===type)
const destructive = tree => nodes(tree).filter(node=>node.type==='Button' && node.props.onClick && nodes(node.props.children).some(child=>child.type==='Trash2'))
const payment = (id,type='termin') => ({id,paymentType:type,paymentDate:'2026-10-17',amount:100})
async function mount(role,payments,proofsPerPayment=1) {
  state.reset(role,payments)
  state.setProofsPerPayment(proofsPerPayment)
  const events=[]
  const props={open:true,invoice:{id:'invoice-1',invoiceCode:'INV-1',totalAmount:500,workOrderId:'wo-1'},onClose(){events.push('close')},onSaved(){events.push('saved')},onError(message){events.push({error:message})},onSuccess(message){events.push({success:message})}}
  const render=()=>{state.begin();return PaymentModal(props)}
  render();state.flush();await tick()
  return {render,props,events}
}

test('saved cash row uses invoice_payments preview dialog and no direct delete, cancellation preserves row',async()=>{
  const {render}=await mount('owner',[payment('cash-1','cash')])
  assert.equal(destructive(render()).length,1)
  destructive(render())[0].props.onClick()
  const dialog=find(render(),'PermanentDeleteDialog')
  assert.equal(dialog.props.module,'invoice_payments')
  assert.deepEqual(dialog.props.ids,['cash-1'])
  assert.equal(state.calls.some(call=>call.op==='write'),false)
  dialog.props.onOpenChange(false)
  assert.equal(find(render(),'PermanentDeleteDialog'),undefined)
  assert.equal(destructive(render()).length,1)
})

test('inventory/staff cannot invoke saved-payment delete; finance can',async()=>{
  for(const role of ['inventory','supervisor','staff']){
    const {render}=await mount(role,[payment('termin-1'),payment('termin-2')])
    assert.equal(destructive(render()).length,0)
    assert.equal(find(render(),'PermanentDeleteDialog'),undefined)
  }
  const {render}=await mount('finance',[payment('termin-1')])
  assert.equal(destructive(render()).length,1)
})

test('cash switch refuses implicit deletion of saved later termin',async()=>{
  const {render,events}=await mount('owner',[payment('termin-1'),payment('termin-2')])
  find(render(),'RadioGroup').props.onValueChange('cash')
  assert.ok(events.some(event=>event.error?.includes('konfirmasi hapus permanen')))
  assert.equal(find(render(),'RadioGroup').props.value,'termin')
  assert.equal(state.calls.some(call=>call.op==='write'),false)
})

test('new unsaved termin removal remains draft-only',async()=>{
  const {render}=await mount('owner',[payment('termin-1')])
  nodes(render()).find(node=>node.type==='Button'&&node.props.children?.some?.(child=>child===' Tambah Termin')).props.onClick()
  assert.equal(destructive(render()).length,2)
  destructive(render())[1].props.onClick()
  assert.equal(destructive(render()).length,1)
  assert.equal(find(render(),'PermanentDeleteDialog'),undefined)
  assert.equal(state.calls.some(call=>call.op==='write'),false)
})

test('removing the last proof keeps payment save blocked without writes',async()=>{
  const {render,events}=await mount('owner',[payment('cash-1','cash')])
  nodes(render()).find(node=>node.type==='Button' && node.props.children==='Hapus').props.onClick()
  const save=nodes(render()).find(node=>node.type==='Button' && node.props.children==='Save Payment')
  assert.equal(save.props.disabled,true)
  save.props.onClick()
  await tick()
  assert.equal(state.calls.some(call=>call.op==='write'||call.op==='removeProof'),false)
  assert.equal(events.some(event=>event.success),false)
})

test('proof cleanup failure remains nonfatal and payment save reconciles invoice and work order',async()=>{
  // Keep one valid proof: removing the only proof correctly blocks saving.
  const {render,events}=await mount('owner',[payment('cash-1','cash')],2)
  nodes(render()).find(node=>node.type==='Button' && node.props.children==='Hapus').props.onClick()
  nodes(render()).find(node=>node.type==='Button' && node.props.children==='Save Payment').props.onClick()
  await tick()
  assert.ok(state.calls.some(call=>call.op==='removeProof'))
  // Existing payment update, invoice finance validation, and work order status.
  assert.equal(state.calls.filter(call=>call.op==='write').length,3)
  assert.ok(events.some(event=>event.success?.includes('file masih menunggu pembersihan')))
  assert.equal(events.some(event=>event.error),false)
  assert.equal(events.at(-1),'saved')
})

test('committed deletion refetches canonical payments/proofs and notifies parent refresh, retaining cleanup warning',async()=>{
  const {render,events}=await mount('owner',[payment('termin-1')])
  destructive(render())[0].props.onClick()
  const dialog=find(render(),'PermanentDeleteDialog')
  const before=state.calls.length
  dialog.props.onDeleted({deletedIds:['termin-1'],counts:{invoice_payments:1},cleanupJobIds:['job-1'],cleanupPending:1,cleanupError:new Error('offline')})
  await tick()
  assert.deepEqual(state.calls.slice(before).map(call=>call.op),['fetchPayments','fetchFiles'])
  assert.ok(events.some(event=>event.success?.includes('tertunda')))
  assert.equal(events.at(-1),'saved')
  assert.equal(state.calls.some(call=>call.op==='write'),false)
})
