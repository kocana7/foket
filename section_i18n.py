import re

with open('main.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ── 1. section-link: add data-i18n="section.viewall" where missing ──
content = re.sub(
    r'<a class="section-link" href="#">전체보기 &rarr;</a>',
    '<a class="section-link" data-i18n="section.viewall" href="#">전체보기 →</a>',
    content
)
print("section-link fixed")

# ── 2. market-chance-label: add data-i18n="card.yeschance" ──
content = content.replace(
    '<div class="market-chance-label">Yes chance</div>',
    '<div class="market-chance-label" data-i18n="card.yeschance">Yes chance</div>'
)
print("market-chance-label fixed")

# ── 3. btn-yes: extract pct, add data-pct + data-i18n-btn="yes" ──
def fix_btn_yes(m):
    pct = re.search(r'Yes (\d+)', m.group(0)).group(1)
    return f'<button class="btn-yes" data-i18n-btn="yes" data-pct="{pct}">Yes {pct}<b class="fcur">F</b></button>'

content = re.sub(r'<button class="btn-yes">Yes \d+<b class="fcur">F</b></button>', fix_btn_yes, content)
print("btn-yes fixed")

# ── 4. btn-no: extract pct, add data-pct + data-i18n-btn="no" ──
def fix_btn_no(m):
    pct = re.search(r'No (\d+)', m.group(0)).group(1)
    return f'<button class="btn-no" data-i18n-btn="no" data-pct="{pct}">No {pct}<b class="fcur">F</b></button>'

content = re.sub(r'<button class="btn-no">No \d+<b class="fcur">F</b></button>', fix_btn_no, content)
print("btn-no fixed")

# ── 5. market-vol: extract vol number, add data-vol + data-i18n="card.vol" ──
# Pattern: <div class="market-vol"><b class="fcur">F</b>2.1M Vol</div>
def fix_vol(m):
    num = re.search(r'F</b>(.+?) Vol', m.group(0)).group(1)
    return f'<div class="market-vol" data-vol="{num}" data-i18n="card.vol"><b class="fcur">F</b>{num} Vol</div>'

content = re.sub(
    r'<div class="market-vol"><b class="fcur">F</b>.+? Vol</div>',
    fix_vol, content
)
print("market-vol fixed")

# ── 6. Add translation keys to all T language blocks ──
new_keys = {
    'ko':  {'card.yeschance': '예측 확률', 'card.yes': '예', 'card.no': '아니오', 'card.vol': '거래량'},
    'en':  {'card.yeschance': 'Yes chance', 'card.yes': 'Yes', 'card.no': 'No', 'card.vol': 'Vol'},
    'ja':  {'card.yeschance': '予測確率', 'card.yes': 'はい', 'card.no': 'いいえ', 'card.vol': '取引量'},
    'zh':  {'card.yeschance': '预测概率', 'card.yes': '是', 'card.no': '否', 'card.vol': '交易量'},
    'fr':  {'card.yeschance': 'Probabilité Oui', 'card.yes': 'Oui', 'card.no': 'Non', 'card.vol': 'Vol'},
    'de':  {'card.yeschance': 'Ja-Wahrscheinlichkeit', 'card.yes': 'Ja', 'card.no': 'Nein', 'card.vol': 'Vol'},
    'es':  {'card.yeschance': 'Probabilidad Sí', 'card.yes': 'Sí', 'card.no': 'No', 'card.vol': 'Vol'},
    'ru':  {'card.yeschance': 'Вероятность Да', 'card.yes': 'Да', 'card.no': 'Нет', 'card.vol': 'Объём'},
}

# Find each language block and append keys after 'section.neighbor' entry
lang_markers = {
    'ko': "'section.neighbor':'나의 이웃'",
    'en': "'section.neighbor':'My Neighborhood'",
    'ja': "'section.neighbor':'近隐'",
    'zh': "'section.neighbor':'我的邻居'",
    'fr': "'section.neighbor':'Mon Quartier'",
    'de': "'section.neighbor':'Meine Nachbarschaft'",
    'es': "'section.neighbor':'Mi Vecindario'",
    'ru': "'section.neighbor':'Мой Район'",
}

for lang, marker in lang_markers.items():
    keys = new_keys[lang]
    additions = ','.join(f"'{k}':'{v}'" for k, v in keys.items())
    content = content.replace(marker, marker + ',' + additions, 1)

print("T object keys added")

# ── 7. Extend applyLanguage() for btn-yes, btn-no, market-vol ──
old_block = '''    // Update market card text
    document.querySelectorAll('[data-card-id]').forEach(function(card) {'''

new_block = '''    // Translate Yes/No buttons (preserve percentage number)
    document.querySelectorAll('[data-i18n-btn]').forEach(function(btn) {
      var type = btn.getAttribute('data-i18n-btn');
      var pct = btn.getAttribute('data-pct');
      var label = type === 'yes' ? (t['card.yes'] || 'Yes') : (t['card.no'] || 'No');
      btn.innerHTML = label + ' ' + pct + '<b class="fcur">F</b>';
    });
    // Translate Vol text (preserve number)
    document.querySelectorAll('[data-vol]').forEach(function(el) {
      var num = el.getAttribute('data-vol');
      var volLabel = t['card.vol'] || 'Vol';
      el.innerHTML = '<b class="fcur">F</b>' + num + ' ' + volLabel;
    });
    // Update market card text
    document.querySelectorAll('[data-card-id]').forEach(function(card) {'''

content = content.replace(old_block, new_block, 1)
print("applyLanguage extended")

with open('main.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
