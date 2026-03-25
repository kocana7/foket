with open('main.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. section-title HTML에 data-i18n 속성 추가
replacements_html = [
    ('<div class="section-title">\uc815\uce58</div>',
     '<div class="section-title" data-i18n="section.politics">\uc815\uce58</div>'),
    ('<div class="section-title">\uc2a4\ud3ec\uce20</div>',
     '<div class="section-title" data-i18n="section.sports2">\uc2a4\ud3ec\uce20</div>'),
    ('<div class="section-title">\ubb38\ud654</div>',
     '<div class="section-title" data-i18n="section.culture">\ubb38\ud654</div>'),
    ('<div class="section-title">\ud2b8\ub808\uc774\ub529</div>',
     '<div class="section-title" data-i18n="section.trading">\ud2b8\ub808\uc774\ub529</div>'),
    ('<div class="section-title">\ub0a0\uc528</div>',
     '<div class="section-title" data-i18n="section.weather">\ub0a0\uc528</div>'),
    ('<div class="section-title">\uacbd\uc81c</div>',
     '<div class="section-title" data-i18n="section.economy">\uacbd\uc81c</div>'),
    ('<div class="section-title">\ubc1c\uc5b8</div>',
     '<div class="section-title" data-i18n="section.statement">\ubc1c\uc5b8</div>'),
    ('<div class="section-title">\uacfc\ud559 &amp; \uae30\uc220</div>',
     '<div class="section-title" data-i18n="section.science">\uacfc\ud559 &amp; \uae30\uc220</div>'),
    ('<div class="section-title">\ub098\uc758 \uc774\uc6c3</div>',
     '<div class="section-title" data-i18n="section.neighbor">\ub098\uc758 \uc774\uc6c3</div>'),
]
for old, new in replacements_html:
    content = content.replace(old, new)

# 2. 각 언어 T 객체에 새 섹션 키 추가
# 언어별 번역값
translations = {
    'ko': {
        'section.politics': '\uc815\uce58',
        'section.sports2': '\uc2a4\ud3ec\uce20',
        'section.culture': '\ubb38\ud654',
        'section.trading': '\ud2b8\ub808\uc774\ub529',
        'section.weather': '\ub0a0\uc528',
        'section.economy': '\uacbd\uc81c',
        'section.statement': '\ubc1c\uc5b8',
        'section.science': '\uacfc\ud559 &amp; \uae30\uc220',
        'section.neighbor': '\ub098\uc758 \uc774\uc6c3',
    },
    'en': {
        'section.politics': 'Politics',
        'section.sports2': 'Sports',
        'section.culture': 'Culture',
        'section.trading': 'Trading',
        'section.weather': 'Weather',
        'section.economy': 'Economy',
        'section.statement': 'Statements',
        'section.science': 'Science &amp; Tech',
        'section.neighbor': 'My Neighborhood',
    },
    'ja': {
        'section.politics': '\u653f\u6cbb',
        'section.sports2': '\u30b9\u30dd\u30fc\u30c4',
        'section.culture': '\u6587\u5316',
        'section.trading': '\u30c8\u30ec\u30fc\u30c7\u30a3\u30f3\u30b0',
        'section.weather': '\u5929\u6c17',
        'section.economy': '\u7d4c\u6e08',
        'section.statement': '\u767a\u8a00',
        'section.science': '\u79d1\u5b66\uff06\u6280\u8853',
        'section.neighbor': '\u8fd1\u9690',
    },
    'zh': {
        'section.politics': '\u653f\u6cbb',
        'section.sports2': '\u4f53\u80b2',
        'section.culture': '\u6587\u5316',
        'section.trading': '\u4ea4\u6613',
        'section.weather': '\u5929\u6c14',
        'section.economy': '\u7ecf\u6d4e',
        'section.statement': '\u58f0\u660e',
        'section.science': '\u79d1\u5b66\u4e0e\u6280\u672f',
        'section.neighbor': '\u6211\u7684\u90bb\u5c45',
    },
    'fr': {
        'section.politics': 'Politique',
        'section.sports2': 'Sports',
        'section.culture': 'Culture',
        'section.trading': 'Trading',
        'section.weather': 'M\xe9t\xe9o',
        'section.economy': '\xc9conomie',
        'section.statement': 'D\xe9clarations',
        'section.science': 'Science &amp; Tech',
        'section.neighbor': 'Mon Quartier',
    },
    'de': {
        'section.politics': 'Politik',
        'section.sports2': 'Sport',
        'section.culture': 'Kultur',
        'section.trading': 'Trading',
        'section.weather': 'Wetter',
        'section.economy': 'Wirtschaft',
        'section.statement': 'Aussagen',
        'section.science': 'Wissenschaft &amp; Tech',
        'section.neighbor': 'Meine Nachbarschaft',
    },
    'es': {
        'section.politics': 'Pol\xedtica',
        'section.sports2': 'Deportes',
        'section.culture': 'Cultura',
        'section.trading': 'Trading',
        'section.weather': 'Clima',
        'section.economy': 'Econom\xeda',
        'section.statement': 'Declaraciones',
        'section.science': 'Ciencia &amp; Tech',
        'section.neighbor': 'Mi Vecindario',
    },
    'ru': {
        'section.politics': '\u041f\u043e\u043b\u0438\u0442\u0438\u043a\u0430',
        'section.sports2': '\u0421\u043f\u043e\u0440\u0442',
        'section.culture': '\u041a\u0443\u043b\u044c\u0442\u0443\u0440\u0430',
        'section.trading': '\u0422\u0440\u0435\u0439\u0434\u0438\u043d\u0433',
        'section.weather': '\u041f\u043e\u0433\u043e\u0434\u0430',
        'section.economy': '\u042d\u043a\u043e\u043d\u043e\u043c\u0438\u043a\u0430',
        'section.statement': '\u0417\u0430\u044f\u0432\u043b\u0435\u043d\u0438\u044f',
        'section.science': '\u041d\u0430\u0443\u043a\u0430 &amp; \u0422\u0435\u0445',
        'section.neighbor': '\u041c\u043e\u0439 \u0420\u0430\u0439\u043e\u043d',
    },
}

# 각 언어 블록에서 'section.browse' 뒤에 새 키들 삽입
for lang, trans in translations.items():
    # 기존 section.browse 키 찾아서 그 뒤에 추가
    # 언어별로 서로 다른 section.browse 값이 있음 - section.financial 뒤 패턴으로 삽입
    new_pairs = ','.join(f"'{k}':'{v}'" for k, v in trans.items())

    # section.browse 키 다음 줄에 추가
    if lang == 'ko':
        old = "'section.financial':'\uae08\uc735 \ub9c8\ucf13','\section.browse':'\uce74\ud14c\uace0\ub9ac\ubcc4 \ud0d0\uc0c9'"
        # 대신 section.browse 바로 뒤에 추가
        marker = "'section.browse':'\uce74\ud14c\uace0\ub9ac\ubcc4 \ud0d0\uc0c9'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'en':
        marker = "'section.browse':'Browse by Category'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'ja':
        marker = "'section.browse':'\u30ab\u30c6\u30b4\u30ea\u5225\u30d6\u30e9\u30a6\u30ba'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'zh':
        marker = "'section.browse':'\u6309\u5206\u7c7b\u6d4f\u89c8'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'fr':
        marker = "'section.browse':'Parcourir par cat\xe9gorie'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'de':
        marker = "'section.browse':'Nach Kategorie durchsuchen'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'es':
        marker = "'section.browse':'Explorar por categor\xeda'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)
    elif lang == 'ru':
        marker = "'section.browse':'\u041f\u0440\u043e\u0441\u043c\u043e\u0442\u0440 \u043f\u043e \u043a\u0430\u0442\u0435\u0433\u043e\u0440\u0438\u044f\u043c'"
        content = content.replace(marker, marker + ',' + new_pairs, 1)

with open('main.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done')
