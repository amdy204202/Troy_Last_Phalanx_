const COPY = Object.freeze({
  objective: '전장 목표를 완수하십시오.', 'enter-shop': 'E 또는 Y로 안전 보급소에 진입하십시오.',
  'lock-slot': '1~4 또는 D-pad+A로 상품을 잠그십시오.', reroll: 'R 또는 X로 열린 슬롯을 재굴림하십시오.',
  banish: 'Delete 또는 RB로 상품을 이번 원정에서 추방하십시오.', purchase: 'Enter 또는 A로 상품을 구매하십시오.',
  complete: '전시 보급 훈련 완료',
});

function actionId(prefix) { return `${prefix}-${Math.trunc(performance.now())}`; }

export function mountCampaignUi(runtime) {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = 'css/campaign-v16.css'; document.head.append(link);
  const root = document.createElement('section'); root.id = 'campaignLayer'; root.innerHTML = `
    <div class="campaign-objective"><small id="campaignPackage"></small><b id="campaignObjective"></b><progress id="campaignProgress" max="1" value="0"></progress><button id="campaignStrike">목표 수행 [F]</button></div>
    <div id="campaignTutorial" class="campaign-tutorial"></div>
    <div id="warShop" class="war-shop" hidden><header><b>전시 보급소</b><span id="shopBalance"></span></header><div id="shopSlots" class="shop-slots"></div><footer><button id="shopReroll">재굴림 [R]</button><button id="shopBanish">추방 [Delete]</button><button id="shopBuy">구매 [Enter]</button><button id="shopClose">복귀 [Esc]</button></footer></div>`;
  document.body.append(root);
  const $ = selector => root.querySelector(selector);
  let latest = runtime.snapshot(), padButtons = [], selected = 0;
  const act = (type, payload = {}) => runtime.dispatch({ type, payload, idempotencyKey: actionId(type) });
  function render(state) {
    latest = state; selected = state.selectedSlot;
    $('#campaignPackage').textContent = `${state.campaign.stage.packageId.toUpperCase()} · ${state.campaign.stage.objectiveId}`;
    $('#campaignObjective').textContent = state.objective.type === 'capture' ? '군기 점령' : state.campaign.stage.packageId === 'shore' ? '상륙 방벽 파괴' : '공성 장치 파괴';
    $('#campaignProgress').max = state.objective.maxProgress; $('#campaignProgress').value = state.objective.progress;
    $('#campaignTutorial').textContent = COPY[state.tutorial.step];
    $('#warShop').hidden = state.campaign.mode !== 'shop';
    if (state.shop) {
      $('#shopBalance').textContent = `${state.shop.balance} 드라크마 · 재굴림 ${state.shop.rerollCost}`;
      $('#shopSlots').innerHTML = state.shop.slots.map((slot,index) => `<button data-slot="${index}" class="${index === selected ? 'selected' : ''}" ${slot ? '' : 'disabled'}><i>${index + 1}</i><b>${slot?.id ?? '비어 있음'}</b><span>${slot ? `${slot.price} D${slot.locked ? ' · 잠금' : ''}` : ''}</span></button>`).join('');
      root.querySelectorAll('[data-slot]').forEach(button => button.addEventListener('click', () => { selected = Number(button.dataset.slot); runtime.selectSlot(selected); }));
    }
  }
  runtime.subscribe(render);
  $('#campaignStrike').addEventListener('click', () => runtime.progressObjective(latest.objective.maxProgress));
  $('#shopReroll').addEventListener('click', () => act('CAMPAIGN_SHOP_REROLL'));
  $('#shopBanish').addEventListener('click', () => act('CAMPAIGN_SHOP_BANISH', { slot: selected }));
  $('#shopBuy').addEventListener('click', () => act('CAMPAIGN_SHOP_BUY', { slot: selected }));
  $('#shopClose').addEventListener('click', () => act('CAMPAIGN_CLOSE_SHOP'));
  addEventListener('keydown', event => {
    if (event.code === 'KeyF' && latest.campaign.mode === 'playing') runtime.progressObjective(latest.objective.maxProgress);
    if (event.code === 'KeyE') act('CAMPAIGN_OPEN_SHOP');
    if (/^Digit[1-4]$/.test(event.code) && latest.campaign.mode === 'shop') { selected = Number(event.code.at(-1)) - 1; runtime.selectSlot(selected); act('CAMPAIGN_SHOP_LOCK', { slot: selected }); }
    if (event.code === 'KeyR' && latest.campaign.mode === 'shop') act('CAMPAIGN_SHOP_REROLL');
    if (event.code === 'Delete' && latest.campaign.mode === 'shop') act('CAMPAIGN_SHOP_BANISH', { slot: selected });
    if (event.code === 'Enter' && latest.campaign.mode === 'shop') act('CAMPAIGN_SHOP_BUY', { slot: selected });
    if (event.code === 'Escape' && latest.campaign.mode === 'shop') act('CAMPAIGN_CLOSE_SHOP');
  });
  function pollGamepad() {
    const pad = navigator.getGamepads?.()[0];
    if (pad) {
      const pressed = pad.buttons.map(button => !!button.pressed), edge = index => pressed[index] && !padButtons[index];
      if (edge(3)) act('CAMPAIGN_OPEN_SHOP');
      if (edge(14)) { selected = Math.max(0, selected - 1); runtime.selectSlot(selected); }
      if (edge(15)) { selected = Math.min(3, selected + 1); runtime.selectSlot(selected); }
      if (edge(0) && latest.tutorial.step === 'lock-slot') act('CAMPAIGN_SHOP_LOCK', { slot: selected });
      else if (edge(0) && latest.tutorial.step === 'purchase') act('CAMPAIGN_SHOP_BUY', { slot: selected });
      if (edge(2)) act('CAMPAIGN_SHOP_REROLL');
      if (edge(5)) act('CAMPAIGN_SHOP_BANISH', { slot: selected });
      padButtons = pressed;
    }
    requestAnimationFrame(pollGamepad);
  }
  requestAnimationFrame(pollGamepad);
  return Object.freeze({ snapshot: () => Object.freeze({ mounted: root.isConnected, shopVisible: !$('#warShop').hidden, tutorialStep: latest.tutorial.step, selectedSlot: selected }) });
}
