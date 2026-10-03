import {readFileSync} from 'node:fs';
import {before,after,test} from 'node:test';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,serverTimestamp} from 'firebase/firestore';
let env;
before(async()=>{
  env=await initializeTestEnvironment({projectId:'demo-mato',firestore:{rules:readFileSync('firestore.rules','utf8'),host:'127.0.0.1',port:8080}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore();
    await setDoc(doc(db,'access','owner'),{enabled:true});
    await setDoc(doc(db,'feeds','test'),{items:[]});
  });
});
after(async()=>{await env?.cleanup();});
test('unauthenticated and unapproved users cannot read feeds',async()=>{
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(),'feeds','test')));
  await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(),'feeds','test')));
});
test('approved owner can read but never write feeds or access list',async()=>{
  const db=env.authenticatedContext('owner').firestore();
  await assertSucceeds(getDoc(doc(db,'feeds','test')));
  await assertFails(setDoc(doc(db,'feeds','test'),{items:[]}));
  await assertFails(setDoc(doc(db,'access','owner'),{enabled:true}));
});
test('preferences are owner-only and schema validated',async()=>{
  const db=env.authenticatedContext('owner').firestore();
  await assertSucceeds(setDoc(doc(db,'users','owner','items','one'),{saved:true,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(db,'users','stranger','items','one'),{saved:true,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(db,'users','owner','items','two'),{saved:'yes',updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(db,'users','owner','items','two'),{saved:true,admin:true,updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(env.authenticatedContext('stranger').firestore(),'users','owner','items','one')));
});
