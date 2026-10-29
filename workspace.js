(function(global){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const FIELDS={task:['title','owner','groupId','phase','date','time','status','required','next','note'],member:['name','role','groupId','responsibility'],team:['name','mission','leadId']};
  const LABELS={title:'仕事名',owner:'担当者',groupId:'担当組織',phase:'区分',date:'日付',time:'開始枠',status:'状態',required:'必須性',next:'次の行動',note:'メモ',name:'名称',role:'役割',responsibility:'担当内容',mission:'組織の担当内容',leadId:'責任者',position:'カードの位置'};
  function seed(data){
    const teams=[
      {id:'team-hq',name:'本部運営',mission:'サンプルの本部担当枠。集合・本部運営・会場準備など。',leadId:'',basis:'サンプルの担当区分から整理した仮組織',version:0},
      {id:'team-info',name:'案内所',mission:'サンプルのパレッタ前・案内所担当枠。搬入チェック・案内・換金対応など。',leadId:'',basis:'サンプルの担当区分から整理した仮組織',version:0},
      {id:'team-meals',name:'お弁当',mission:'サンプルの弁当担当枠。出演者等への配布・受け渡し。',leadId:'',basis:'サンプルの担当区分から整理した仮組織',version:0},
      {id:'team-mc',name:'屋形司会',mission:'サンプルの屋形司会担当枠。ステージ・屋形の進行。',leadId:'',basis:'サンプルの担当区分から整理した仮組織',version:0}
    ];
    const members=clone(data.members).map(m=>({...m,sourceRole:m.role,groupId:m.source==='paletta'?'team-info':m.col===7?'team-meals':[9,10].includes(m.col)?'team-mc':'team-hq',responsibility:'サンプル上の担当：'+m.role,version:0}));
    const tasks=clone(data.tasks).map(t=>({...t,groupId:members.find(m=>m.id===t.owner)?.groupId||'',version:0}));
    return {schema:1,eventId:data.event.id,revision:0,tasks,members,teams,order:tasks.map(t=>t.id),history:[]};
  }
  function display(field,value,state){
    if(field==='owner'||field==='leadId')return state.members.find(m=>m.id===value)?.name||(value?'不明なメンバー':'未設定');
    if(field==='groupId')return state.teams.find(t=>t.id===value)?.name||'組織未設定';
    if(field==='required')return value===true?'必須':value===false?'任意':'未確認';
    return value===null||value===undefined||value===''?'未設定':String(value);
  }
  function create(data,storage){
    const key='event-compass:workspace:v1:'+data.event.id;
    let current=seed(data),loadError='';
    function latest(){
      let raw;try{raw=storage?.getItem(key)}catch{throw Error('このブラウザの保存領域を利用できません。保存設定を確認してください。')}
      if(!raw)return current;
      let saved;try{saved=JSON.parse(raw)}catch{throw Error('保存済みデータを読み取れません。データを上書きせず処理を止めました。')}
      if(saved.schema!==1||saved.eventId!==data.event.id||!Array.isArray(saved.tasks)||!Array.isArray(saved.history)||!Array.isArray(saved.members)||!Array.isArray(saved.teams)||!Array.isArray(saved.order))throw Error('保存データの形式が異なります。上書きせず処理を止めました。');
      return saved;
    }
    try{current=latest()}catch(e){loadError=e.message}
    function snapshot(){return clone(current)}
    function commit(command){
      if(loadError)throw Error(loadError);
      const actor=String(command.actor||'').trim();if(!actor)throw Error('履歴に記録する操作名を入力してください。');
      const before=clone(latest()),next=clone(before),type=command.entity||'task',collection={task:'tasks',member:'members',team:'teams'}[type];
      if(!collection)throw Error('更新対象が不正です。');
      const list=next[collection],isNew=command.action==='create';
      let item=isNew?null:list.find(x=>x.id===command.id);
      if(!isNew&&!item)throw Error('対象が見つかりません。再表示して確認してください。');
      if(item&&command.expectedVersion!==undefined&&item.version!==command.expectedVersion)throw Error('この項目は別の操作で更新されています。詳細を開き直してください。');
      const old=clone(item||{}),patch={};for(const k of FIELDS[type])if(Object.hasOwn(command.patch||{},k))patch[k]=command.patch[k];
      if(isNew){const id=(global.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));item=type==='task'?{id:'LOCAL-'+id,title:'',owner:'',groupId:'',phase:'当日',date:'',time:'',status:'未着手',required:null,next:'',note:'',kind:'local',sourceStatus:null,version:0}:type==='member'?{id:'MEM-'+id,name:'',role:'',groupId:'',responsibility:'',version:0}:{id:'TEAM-'+id,name:'',mission:'',leadId:'',basis:'ブラウザ内で追加した組織',version:0};list.push(item)}
      Object.assign(item,patch);
      if(type==='task'){
        item.title=String(item.title||'').trim();if(!item.title)throw Error('仕事名を入力してください。');
        if(!['未確認','未着手','進行中','確認待ち','完了'].includes(item.status))throw Error('状態が不正です。');
        if(!['準備','当日','終了後','改善候補'].includes(item.phase))throw Error('区分が不正です。');
        if(item.groupId&&!next.teams.some(t=>t.id===item.groupId))throw Error('担当組織が見つかりません。');
        if(item.owner){const m=next.members.find(m=>m.id===item.owner);if(!m)throw Error('担当者が見つかりません。');if(Object.hasOwn(patch,'owner')&&!Object.hasOwn(patch,'groupId'))item.groupId=m.groupId||'';if(item.groupId!==(m.groupId||'')){if(Object.hasOwn(patch,'groupId')&&!Object.hasOwn(patch,'owner'))item.owner='';else throw Error('担当者と担当組織の組み合わせを確認してください。')}}
      }else if(type==='member'){
        item.name=String(item.name||'').trim();if(!item.name)throw Error('氏名・担当枠名を入力してください。');
        if(item.groupId&&!next.teams.some(t=>t.id===item.groupId))throw Error('所属組織が見つかりません。');
      }else{
        item.name=String(item.name||'').trim();if(!item.name)throw Error('組織名を入力してください。');
        if(item.leadId&&!next.members.some(m=>m.id===item.leadId&&m.groupId===item.id))throw Error('責任者はこの組織の所属メンバーから選択してください。');
      }
      const changes=FIELDS[type].filter(k=>JSON.stringify(old[k]??null)!==JSON.stringify(item[k]??null)).map(k=>({field:k,label:LABELS[k],before:old[k]??null,after:item[k]??null,beforeText:display(k,old[k],before),afterText:display(k,item[k],next)}));
      const related=[];
      if(type==='member'&&old.groupId!==undefined&&old.groupId!==item.groupId){
        for(const task of next.tasks.filter(t=>t.owner===item.id)){const previous=task.groupId;task.groupId=item.groupId;task.edited=true;task.version++;related.push({entity:'task',id:task.id,title:task.title,field:'groupId',label:'担当組織',before:previous,after:task.groupId,beforeText:display('groupId',previous,before),afterText:display('groupId',task.groupId,next)})}
        for(const team of next.teams.filter(t=>t.leadId===item.id&&t.id!==item.groupId)){team.leadId='';team.version++;related.push({entity:'team',id:team.id,title:team.name,field:'leadId',label:'責任者',before:item.id,after:'',beforeText:display('leadId',item.id,before),afterText:'未設定'})}
      }
      if(type==='task'&&(isNew||command.action==='move')){
        if(command.beforeId===item.id&&changes.length===0)return {changed:false,state:clone(before)};
        const oldPosition=next.order.indexOf(item.id);next.order=next.order.filter(id=>id!==item.id);
        const target=command.beforeId?next.tasks.find(t=>t.id===command.beforeId):null;
        if(command.beforeId&&!target)throw Error('移動先のカードが見つかりません。');
        if(target&&target.id!==item.id){const at=next.order.indexOf(target.id);next.order.splice(at<0?next.order.length:at,0,item.id)}else{const same=next.order.filter(id=>next.tasks.find(t=>t.id===id)?.status===item.status);const last=same.length?next.order.indexOf(same[same.length-1]):next.order.length-1;next.order.splice(last+1,0,item.id)}
        const newPosition=next.order.indexOf(item.id);if(!isNew&&oldPosition!==newPosition)changes.push({field:'position',label:'カードの位置',before:oldPosition+1,after:newPosition+1,beforeText:String(oldPosition+1),afterText:String(newPosition+1)});
      }
      if(!isNew&&!changes.length&&!related.length)return {changed:false,state:clone(before)};
      item.version=(old.version||0)+1;item.edited=true;
      const at=new Date().toISOString();item.updatedAt=at;next.revision=before.revision+1;
      const entry={id:'H-'+(global.crypto?.randomUUID?.()||next.revision+'-'+Date.now()),at,actor:{name:actor,kind:'self_declared'},entity:type,targetId:item.id,title:item.title||item.name,action:isNew?'create':command.action==='move'?'move':command.action==='assign'?'assign':'update',changes,related};
      next.history.push(entry);
      try{if(!storage)throw Error();storage.setItem(key,JSON.stringify(next))}catch{throw Error('変更を保存できませんでした。空き容量・ブラウザ設定を確認してください。変更前の状態を維持しています。')}
      current=next;return {changed:true,state:snapshot(),entry:clone(entry)};
    }
    return {key,snapshot,commit,error:()=>loadError,reload(){try{current=latest();loadError='';return snapshot()}catch(e){loadError=e.message;throw e}}};
  }
  global.WorkspaceStore={create};
})(typeof window!=='undefined'?window:globalThis);
