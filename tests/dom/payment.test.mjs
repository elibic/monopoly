import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

async function fixture({ amount=180, math=true, keypad='on', purchase=true }={}) {
  const dom=new JSDOM('<!doctype html><body><div id="dialog-root" class="hidden"></div><button id="sound-btn"></button><p id="speech-caption"></p></body>',{url:'https://example.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window;w.matchMedia=()=>({matches:false});
  w.MonopolyNarrator=class { say(){return Promise.resolve();} stop(){} };
  for(const file of ['data','engine','ui'])w.eval(await readFile(new URL('../../js/'+file+'.js',import.meta.url),'utf8'));
  const g=new w.MonopolyEngine.Game([{name:'דנה',token:'🚗'},{name:'רובי',token:'🐶',isAI:true}],{manualPay:true,payMath:math,auctions:false});
  if(purchase){g.current().pos=18;g.pendingBuy=18;g.phase='buy';g.buy();}
  else g._charge(0,amount,null,'מס',null,{kind:'afterAction'});
  w.MonopolyUI.setKeypadPref(keypad);
  let confirmed=0,cancelled=0;
  w.MonopolyUI.showPayDialog(g,0,{onConfirm:n=>{confirmed++;g.confirmPayment(n);},onCancel:()=>{cancelled++;g.cancelPendingPurchase();}});
  const $=s=>w.document.querySelector(s);
  const type=(s,v)=>{$(s).focus();$(s).value=v;$(s).dispatchEvent(new w.Event('input',{bubbles:true}));};
  return {dom,w,g,$,type,count:()=>({confirmed,cancelled})};
}

test('payment fields stay editable; wrong 150 can become 180 and balance can be entered first',async()=>{
  const f=await fixture();try {
    assert.equal(f.$('#pay-input').readOnly,false);assert.equal(f.$('#left-input').disabled,false);
    f.type('#left-input','1320');f.type('#pay-input','150');assert.equal(f.$('#pay-go').disabled,true);
    f.type('#pay-input','180');assert.equal(f.$('#pay-go').disabled,false);
    f.type('#pay-input','');assert.equal(f.$('#pay-go').disabled,true);
    f.type('#pay-input','180');f.$('#pay-go').click();
    assert.equal(f.count().confirmed,1);assert.equal(f.g.current().money,1320);assert.equal(f.g.owner[18],0);
  }finally{f.dom.window.close();}
});
test('cancel button abandons unpaid purchase without sending money',async()=>{
  const f=await fixture();try {
    f.type('#pay-input','150');f.$('#pay-cancel').click();
    assert.equal(f.count().cancelled,1);assert.equal(f.count().confirmed,0);
    assert.equal(f.g.current().money,1500);assert.equal(f.g.owner[18],null);assert.equal(f.g.phase,'end');
    assert.equal(f.$('#dialog-root').classList.contains('hidden'),true);
  }finally{f.dom.window.close();}
});
test('keypad replaces selected digits and edits whichever field is focused',async()=>{
  const f=await fixture();try {
    f.type('#pay-input','150');f.$('#pay-input').setSelectionRange(1,2);
    const key=v=>[...f.w.document.querySelectorAll('.numpad button')].find(b=>b.textContent===v).click();
    key('8');assert.equal(f.$('#pay-input').value,'180');
    f.$('#left-input').focus();for(const n of ['1','3','2','0'])key(n);
    assert.equal(f.$('#left-input').value,'1320');assert.equal(f.$('#pay-go').disabled,false);
    key('⌫');assert.equal(f.$('#left-input').value,'132');assert.equal(f.$('#pay-go').disabled,true);
    f.$('#pay-keyboard').click();assert.equal(f.$('#payment-keypad').hidden,true);
  }finally{f.dom.window.close();}
});
test('mandatory payments have no cancellation, and blank zero balance is not accepted',async()=>{
  const f=await fixture({purchase:false,amount:1500});try{
    assert.equal(f.$('#pay-cancel'),null);
    f.type('#pay-input','1500');assert.equal(f.$('#pay-go').disabled,true);
    f.type('#left-input','0');assert.equal(f.$('#pay-go').disabled,false);
  }finally{f.dom.window.close();}
});
