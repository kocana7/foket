with open('main.html', 'r', encoding='utf-8') as f:
    content = f.read()

def card(icon, cat, question, prob, vol):
    no = 100 - prob
    bg = '; background:var(--red)' if prob < 35 else ''
    q_safe = question.replace("'", "&#39;")
    return (
        f'      <div class="market-card" onclick="openTrade(\'{q_safe}\', {prob})">\n'
        f'        <div class="market-card-top">\n'
        f'          <div class="market-icon">{icon}</div>\n'
        f'          <div class="market-meta">\n'
        f'            <div class="market-category">{cat}</div>\n'
        f'            <div class="market-question">{question}</div>\n'
        f'          </div>\n'
        f'        </div>\n'
        f'        <div class="market-prob-bar"><div class="market-prob-fill" style="width:{prob}%{bg}"></div></div>\n'
        f'        <div class="market-card-bottom">\n'
        f'          <div class="market-chance"><div class="market-chance-val">{prob}<b class="fcur">F</b></div><div class="market-chance-label">Yes chance</div></div>\n'
        f'          <div>\n'
        f'            <div class="market-vol"><b class="fcur">F</b>{vol} Vol</div>\n'
        f'            <div class="market-btns"><button class="btn-yes">Yes {prob}<b class="fcur">F</b></button><button class="btn-no">No {no}<b class="fcur">F</b></button></div>\n'
        f'          </div>\n'
        f'        </div>\n'
        f'      </div>'
    )

def section_html(id_, title, display_title, cards_data, alt_bg):
    bg_attr = ' style="background:var(--gray-50)"' if alt_bg else ''
    cards_str = '\n'.join(card(*c) for c in cards_data)
    return (
        f'\n<!-- {title.upper()} -->\n'
        f'<section class="section" id="{id_}"{bg_attr}>\n'
        f'  <div class="section-inner">\n'
        f'    <div class="section-header">\n'
        f'      <div class="section-title">{display_title}</div>\n'
        f'      <a class="section-link" href="#">\uc804\uccb4\ubcf4\uae30 &rarr;</a>\n'
        f'    </div>\n'
        f'    <div class="market-grid">\n'
        f'{cards_str}\n'
        f'    </div>\n'
        f'  </div>\n'
        f'</section>\n'
    )

data = [
    ('politics', '\uc815\uce58', '\uc815\uce58', [
        ('\U0001f5f3\ufe0f', '\uc815\uce58 \xb7 \uad6d\ub0b4', '\uc774\uc7ac\uba85 \ub300\ud1b5\ub839 \uc9c0\uc9c0\uc728\uc774 2026\ub144 \uc0c1\ubc18\uae30 50%\ub97c \ub118\uc744\uae4c\uc694?', 58, '1.4M'),
        ('\U0001f30f', '\uc815\uce58 \xb7 \uad6d\uc81c', '\ub7ec\uc2dc\uc544-\uc6b0\ud06c\ub77c\uc774\ub098 \uc804\uc7c1\uc774 2026\ub144 \ub0b4 \uc885\uc804\ub420\uae4c\uc694?', 31, '2.8M'),
        ('\U0001f91d', '\uc815\uce58 \xb7 \uc678\uad50', '\ud55c\uc77c \uc815\uc0c1\ud68c\ub2f4\uc774 2026\ub144 \uc0c1\ubc18\uae30\uc5d0 \uc5f4\ub9b4\uae4c\uc694?', 63, '980K'),
        ('\U0001f1f0\U0001f1f5', '\uc815\uce58 \xb7 \ubd81\ud55c', '\ubd81\ud55c\uc774 2026\ub144 \ud575\uc2e4\ud5d8\uc744 \uac15\ud589\ud560\uae4c\uc694?', 22, '1.1M'),
        ('\U0001f1fa\U0001f1f8', '\uc815\uce58 \xb7 \ubbf8\uad6d', '\ud2b8\ub7fc\ud504 \ub300\ud1b5\ub839\uc758 \uc9c0\uc9c0\uc728\uc774 50%\ub97c \ub118\uc744\uae4c\uc694?', 44, '3.2M'),
        ('\U0001f30d', '\uc815\uce58 \xb7 \uad6d\uc81c', 'EU\uac00 2026\ub144 \ub0b4 \uc0c8\ub85c\uc6b4 \ud0c4\uc18c\uc138\ub97c \ub3c4\uc785\ud560\uae4c\uc694?', 67, '760K'),
        ('\U0001f5f3\ufe0f', '\uc815\uce58 \xb7 \uad6d\ub0b4', '\uc5ec\ub2f9\uc774 2026\ub144 \uc9c0\ubc29\uc120\uac70\uc5d0\uc11c \uacfc\ubc18\uc744 \ud655\ubcf4\ud560\uae4c\uc694?', 54, '1.9M'),
        ('\U0001f30f', '\uc815\uce58 \xb7 \uc678\uad50', '\ud55c\uad6d\uc774 2026\ub144 UN \uc548\ubcf4\ub9ac \ube44\uc0c1\uc784\uc774\uc0ac\uad6d\uc5d0 \uc120\ucd9c\ub420\uae4c\uc694?', 71, '540K'),
    ], True),
    ('sports', '\uc2a4\ud3ec\uce20', '\uc2a4\ud3ec\uce20', [
        ('\u26bd', '\uc2a4\ud3ec\uce20 \xb7 \ucd95\uad6c', '\uc190\ud765\ubbfc\uc774 2025-26 \uc2dc\uc98c 20\uace8 \uc774\uc0c1\uc744 \uae30\ub85d\ud560\uae4c\uc694?', 55, '2.1M'),
        ('\u26be', '\uc2a4\ud3ec\uce20 \xb7 \uc57c\uad6c', '\ud55c\uad6d \uc57c\uad6c \ub300\ud45c\ud300\uc774 2026 WBC\uc5d0\uc11c 8\uac15\uc5d0 \uc9c4\ucd9c\ud560\uae4c\uc694?', 71, '1.8M'),
        ('\U0001f3c0', '\uc2a4\ud3ec\uce20 \xb7 \ub18d\uad6c', '\ud55c\uad6d \ub0a8\uc790 \ub18d\uad6c\uac00 2026 \uc544\uc2dc\uc548\uac8c\uc784\uc5d0\uc11c \uae08\uba54\ub2ec\uc744 \ub536\uae4c\uc694?', 48, '670K'),
        ('\u26f3', '\uc2a4\ud3ec\uce20 \xb7 \uace8\ud504', '\uae40\uc8fc\ud615\uc774 2026 \ub9c8\uc2a4\ud130\uc2a4 \ud1a0\ub108\uba3c\ud2b8\uc5d0\uc11c \uc6b0\uc2b9\ud560\uae4c\uc694?', 29, '1.3M'),
        ('\U0001f3ca', '\uc2a4\ud3ec\uce20 \xb7 \uc218\uc601', '\ud669\uc120\uc6b0\uac00 2026 \uc138\uacc4\uc120\uc218\uad8c\uc5d0\uc11c \uae08\uba54\ub2ec\uc744 \ud68d\ub4dd\ud560\uae4c\uc694?', 62, '890K'),
        ('\U0001f94a', '\uc2a4\ud3ec\uce20 \xb7 \uaca9\ud22c\uae30', '\ud55c\uad6d \uc120\uc218\uac00 2026\ub144 WBC \ubcf5\uc2f1 \uccb4\ud53c\uc5b8\uc774 \ub420\uae4c\uc694?', 37, '440K'),
        ('\U0001f3be', '\uc2a4\ud3ec\uce20 \xb7 \ud14c\ub2c8\uc2a4', '\uad8c\uc21c\uc6b0\uac00 2026\ub144 ATP \ud22c\uc5b4\uc5d0\uc11c \uc6b0\uc2b9\uc744 \uae30\ub85d\ud560\uae4c\uc694?', 41, '560K'),
        ('\U0001f3cb\ufe0f', '\uc2a4\ud3ec\uce20 \xb7 \uc5ed\ub3c4', '\ud55c\uad6d\uc774 2026 \uc544\uc2dc\uc548\uac8c\uc784 \uae08\uba54\ub2ec 10\uac1c \uc774\uc0c1 \ud68d\ub4dd\ud560\uae4c\uc694?', 74, '720K'),
    ], False),
    ('culture', '\ubb38\ud654', '\ubb38\ud654', [
        ('\U0001f3b5', '\ubb38\ud654 \xb7 K-pop', 'BTS\uac00 2026\ub144 \uc644\uc804\uccb4 \ucef4\ubc31\uc744 \ud560\uae4c\uc694?', 68, '4.5M'),
        ('\U0001f3ac', '\ubb38\ud654 \xb7 \uc601\ud654', '\ubd09\uc900\ud638 \uac10\ub3c5 \uc2e0\uc791\uc774 2026 \uce78\uc5d0\uc11c \ud669\uae08\uc885\ub824\uc0c1\uc744 \ubc1b\uc744\uae4c\uc694?', 34, '1.2M'),
        ('\U0001f4fa', '\ubb38\ud654 \xb7 \ub4dc\ub77c\ub9c8', '\ub137\ud50c\ub9ad\uc2a4 \ud55c\uad6d \ub4dc\ub77c\ub9c8\uac00 2026 \uc5d0\ubbf8\uc0c1\uc744 \uc218\uc0c1\ud560\uae4c\uc694?', 57, '2.3M'),
        ('\U0001f3a4', '\ubb38\ud654 \xb7 K-pop', '\uc544\uc774\uc720 \uc2e0\ubcf4\uac00 2026\ub144 \uba9c\ub860 \uc5f0\uac04 \ucc28\ud2b8 1\uc704\ub97c \ucc28\uc9c0\ud560\uae4c\uc694?', 72, '3.1M'),
        ('\U0001f3c6', '\ubb38\ud654 \xb7 \uc2dc\uc0c1\uc2dd', 'IVE\uac00 2026 MAMA \uc62c\ud574\uc758 \uc544\ud2f0\uc2a4\ud2b8\ub97c \uc218\uc0c1\ud560\uae4c\uc694?', 46, '1.7M'),
        ('\U0001f4da', '\ubb38\ud654 \xb7 \ucd9c\ud310', '\ud55c\uad6d \uc18c\uc124\uc774 2026 \ubd80\ucee4\uc0c1 \ud6c4\ubcf4\uc5d0 \uc624\ub97c\uae4c\uc694?', 38, '480K'),
        ('\U0001f3ad', '\ubb38\ud654 \xb7 \uacf5\uc5f0', '\ud55c\uad6d \ubba4\uc9c0\ucef9\uc774 2026\ub144 \ube0c\ub85c\ub4dc\uc6e8\uc774\uc5d0 \uc9c4\ucd9c\ud560\uae4c\uc694?', 23, '610K'),
        ('\U0001f3ae', '\ubb38\ud654 \xb7 e\uc2a4\ud3ec\uce20', '\ud55c\uad6d \ud300\uc774 2026 \ub864\ub4dc\ucef5\uc5d0\uc11c \uc6b0\uc2b9\ud560\uae4c\uc694?', 61, '5.2M'),
    ], True),
    ('trading', '\ud2b8\ub808\uc774\ub529', '\ud2b8\ub808\uc774\ub529', [
        ('\u20bf', '\ud2b8\ub808\uc774\ub529 \xb7 \uc554\ud638\ud654\ud3d0', '\ube44\ud2b8\ucf54\uc778\uc774 2026\ub144 \uc0c1\ubc18\uae30 10\ub9cc \ub2ec\ub7ec\ub97c \ub3cc\ud30c\ud560\uae4c\uc694?', 53, '8.4M'),
        ('\U0001f4c8', '\ud2b8\ub808\uc774\ub529 \xb7 \uc8fc\uc2dd', 'KOSPI\uac00 2026\ub144 3,000 \ud3ec\uc778\ud2b8\ub97c \ub118\uc744\uae4c\uc694?', 47, '3.7M'),
        ('\U0001f4b0', '\ud2b8\ub808\uc774\ub529 \xb7 \uc8fc\uc2dd', '\uc0bc\uc131\uc804\uc790 \uc8fc\uac00\uac00 2026\ub144 9\ub9cc \uc6d0\uc744 \ub3cc\ud30c\ud560\uae4c\uc694?', 42, '4.1M'),
        ('\U0001f4ca', '\ud2b8\ub808\uc774\ub529 \xb7 \uc8fc\uc2dd', 'S&P 500\uc774 2026\ub144 6,000\uc744 \ub118\uc744\uae4c\uc694?', 66, '6.3M'),
        ('\U0001f947', '\ud2b8\ub808\uc774\ub529 \xb7 \uc6d0\uc790\uc7ac', '\uae08 \uac00\uaca9\uc774 \uc628\uc2a4\ub2f9 3,000\ub2ec\ub7ec\ub97c \ub3cc\ud30c\ud560\uae4c\uc694?', 74, '2.9M'),
        ('\U0001f697', '\ud2b8\ub808\uc774\ub529 \xb7 \uc8fc\uc2dd', '\ud14c\uc2ac\ub77c \uc8fc\uac00\uac00 2026\ub144 500\ub2ec\ub7ec\ub97c \ub118\uc744\uae4c\uc694?', 38, '3.8M'),
        ('\U0001f4b1', '\ud2b8\ub808\uc774\ub529 \xb7 \ud658\uc728', '\uc6d0/\ub2ec\ub7ec \ud658\uc728\uc774 2026\ub144 \ub9d0 1,200\uc6d0 \uc544\ub798\ub85c \ub0b4\ub824\uc62c\uae4c\uc694?', 29, '1.6M'),
        ('\u27e0', '\ud2b8\ub808\uc774\ub529 \xb7 \uc554\ud638\ud654\ud3d0', '\uc774\ub354\ub9ac\uc6c0\uc774 2026\ub144 5,000\ub2ec\ub7ec\ub97c \ub3cc\ud30c\ud560\uae4c\uc694?', 51, '5.7M'),
    ], False),
    ('weather', '\ub0a0\uc528', '\ub0a0\uc528', [
        ('\u2600\ufe0f', '\ub0a0\uc528 \xb7 \uc11c\uc6b8', '\uc11c\uc6b8 2026\ub144 \uc5ec\ub984 \ucd5c\uace0\uae30\uc628\uc774 40\ub3c4\ub97c \ub118\uc744\uae4c\uc694?', 63, '780K'),
        ('\U0001f300', '\ub0a0\uc528 \xb7 \ud0dc\ud48d', '2026\ub144 \ud55c\ubc18\ub3c4\uc5d0 \ud0dc\ud48d\uc774 3\uac1c \uc774\uc0c1 \uc0c1\ub959\ud560\uae4c\uc694?', 44, '520K'),
        ('\U0001f327\ufe0f', '\ub0a0\uc528 \xb7 \uc7a5\ub9c8', '2026\ub144 \uc7a5\ub9c8 \uae30\uac04\uc774 40\uc77c \uc774\uc0c1 \uc9c0\uc18d\ub420\uae4c\uc694?', 37, '430K'),
        ('\U0001f328\ufe0f', '\ub0a0\uc528 \xb7 \uc11c\uc6b8', '2026\ub144 \uc11c\uc6b8 \uccab\ub208\uc774 11\uc6d4\uc5d0 \ub0b4\ub9b4\uae4c\uc694?', 52, '390K'),
        ('\U0001f32a\ufe0f', '\ub0a0\uc528 \xb7 \uae30\ud6c4', '2026\ub144 \ud3ed\uc5fc \uc77c\uc218\uac00 2025\ub144\ubcf4\ub2e4 \ub9ce\uc744\uae4c\uc694?', 68, '610K'),
        ('\U0001f338', '\ub0a0\uc528 \xb7 \ubd04', '2026\ub144 \uc11c\uc6b8 \ubcf2\uafbd \uac1c\ud654\uc77c\uc774 3\uc6d4 \uc548\uc5d0 \uc62c\uae4c\uc694?', 71, '480K'),
        ('\U0001f32b\ufe0f', '\ub0a0\uc528 \xb7 \ud669\uc0ac', '2026\ub144 \ubd04 \ud669\uc0ac \ubc1c\ub839 \ud69f\uc218\uac00 5\ud68c\ub97c \ub118\uc744\uae4c\uc694?', 55, '340K'),
        ('\u2744\ufe0f', '\ub0a0\uc528 \xb7 \uaca8\uc6b8', '2026\ub144 \ud55c\uad6d \uaca8\uc6b8\uc774 \ud3c9\ub144\ubcf4\ub2e4 \ub530\ub73b\ud560\uae4c\uc694?', 48, '290K'),
    ], True),
    ('economy', '\uacbd\uc81c', '\uacbd\uc81c', [
        ('\U0001f4ca', '\uacbd\uc81c \xb7 \uc131\uc7a5', '\ud55c\uad6d 2026\ub144 GDP \uc131\uc7a5\ub960\uc774 3%\ub97c \ub118\uc744\uae4c\uc694?', 59, '2.1M'),
        ('\U0001f3e6', '\uacbd\uc81c \xb7 \uae08\ub9ac', '\ud55c\uad6d\uc740\ud589\uc774 2026\ub144 \uae30\uc900\uae08\ub9ac\ub97c 2\ud68c \uc774\uc0c1 \uc778\ud558\ud560\uae4c\uc694?', 67, '3.4M'),
        ('\U0001f3e0', '\uacbd\uc81c \xb7 \ubd80\ub3d9\uc0b0', '\uc11c\uc6b8 \uc544\ud30c\ud2b8 \ud3c9\uade0 \uac00\uaca9\uc774 2026\ub144 \uc0c1\ubc18\uae30\uc5d0 \ud558\ub77d\ud560\uae4c\uc694?', 41, '1.8M'),
        ('\U0001f4bc', '\uacbd\uc81c \xb7 \uace0\uc6a9', '\ud55c\uad6d \uccad\ub144 \uc2e4\uc5c5\ub960\uc774 2026\ub144 5% \uc544\ub798\ub85c \ub0b4\ub824\uc62c\uae4c\uc694?', 38, '960K'),
        ('\U0001f310', '\uacbd\uc81c \xb7 \ubb34\uc5ed', '\ud55c\uad6d \uc218\ucd9c\uc774 2026\ub144 \uc5ed\ub300 \ucd5c\uace0\uce58\ub97c \uae30\ub85d\ud560\uae4c\uc694?', 54, '1.3M'),
        ('\U0001f4b5', '\uacbd\uc81c \xb7 \ubb3c\uac00', '\uc18c\ube44\uc790\ubb3c\uac00 \uc0c1\uc2b9\ub960\uc774 2026\ub144 2% \uc544\ub798\ub85c \uc548\uc815\ub420\uae4c\uc694?', 62, '870K'),
        ('\U0001f3ed', '\uacbd\uc81c \xb7 \uc0b0\uc5c5', '\ubc18\ub3c4\uccb4\uac00 2026\ub144 \ud55c\uad6d \uc218\ucd9c 1\uc704 \ud488\ubaa9\uc744 \uc720\uc9c0\ud560\uae4c\uc694?', 83, '1.5M'),
        ('\U0001f4c9', '\uacbd\uc81c \xb7 \ubbf8\uad6d', '\ubbf8\uad6d\uc774 2026\ub144 \uacbd\uae30\uce68\uccb4\uc5d0 \uc9c4\uc785\ud560\uae4c\uc694?', 28, '4.2M'),
    ], False),
    ('statement', '\ubc1c\uc5b8', '\ubc1c\uc5b8', [
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uae30\uc5c5', '\uc77c\ub860 \uba38\uc2a4\ud06c\uac00 2026\ub144 X(\ud2b8\uc704\ud130) \ub9e4\uac01 \uc758\uc0ac\ub97c \ubc1d\ud790\uae4c\uc694?', 21, '1.9M'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uc815\uce58', '\ud2b8\ub7fc\ud504 \ub300\ud1b5\ub839\uc774 2026\ub144 NATO \ud0c8\ud1f4\ub97c \uc120\uc5b8\ud560\uae4c\uc694?', 17, '2.7M'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uae08\uc735', '\uc81c\ub86c \ud30c\uc6a8\uc774 2026\ub144 \uc0c1\ubc18\uae30 \uae08\ub9ac \uc778\ud558\ub97c \uacf5\uc2dd \uc120\uc5b8\ud560\uae4c\uc694?', 71, '3.1M'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uae30\uc5c5', '\uc6cc\ub80c \ubc84\ud3cf\uc774 2026\ub144 \ud55c\uad6d \uae30\uc5c5 \ud22c\uc790\ub97c \ubc1c\ud45c\ud560\uae4c\uc694?', 14, '890K'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 AI', '\uc624\ud508AI CEO\uac00 2026\ub144 AGI \ub2ec\uc131\uc744 \uacf5\uc2dd \uc120\uc5b8\ud560\uae4c\uc694?', 22, '4.3M'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uae30\uc5c5', '\uc0bc\uc131 \ud68c\uc7a5\uc774 2026\ub144 \ub300\uaddc\ubaa8 \ud574\uc678 \ud22c\uc790 \uacc4\ud68d\uc744 \ubc1c\ud45c\ud560\uae4c\uc694?', 58, '1.2M'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uc678\uad50', '\ud55c\uad6d \ub300\ud1b5\ub839\uc774 \ubbf8\uc911 \uc815\uc0c1\ud68c\ub2f4\uc744 \uacf5\uc2dd \uc81c\uc548\ud560\uae4c\uc694?', 44, '760K'),
        ('\U0001f4ac', '\ubc1c\uc5b8 \xb7 \uae30\uc5c5', '\ub124\uc774\ubc84 CEO\uac00 2026\ub144 AI \uc0ac\uc5c5 \ubd84\uc0ac\ub97c \ubc1c\ud45c\ud560\uae4c\uc694?', 33, '640K'),
    ], True),
    ('science', '\uacfc\ud559&\uae30\uc220', '\uacfc\ud559 &amp; \uae30\uc220', [
        ('\U0001f916', '\uacfc\ud559&\uae30\uc220 \xb7 AI', 'GPT-5\uac00 2026\ub144 \uc0c1\ubc18\uae30\uc5d0 \ucd9c\uc2dc\ub420\uae4c\uc694?', 63, '5.8M'),
        ('\U0001f680', '\uacfc\ud559&\uae30\uc220 \xb7 \uc6b0\uc8fc', '\ud55c\uad6d \ub2ec \ud0d0\uc0ac\uc120\uc774 2026\ub144 \ub2ec \uada4\ub3c4 \uc9c4\uc785\uc5d0 \uc131\uacf5\ud560\uae4c\uc694?', 57, '1.4M'),
        ('\U0001f4f1', '\uacfc\ud559&\uae30\uc220 \xb7 \ubaa8\ubc14\uc77c', '\uc560\ud50c\uc774 2026\ub144 \uc811\ub294 \uc544\uc774\ud3f0\uc744 \ucd9c\uc2dc\ud560\uae4c\uc694?', 72, '4.1M'),
        ('\U0001f52c', '\uacfc\ud559&\uae30\uc220 \xb7 \ubc18\ub3c4\uccb4', '\uc0bc\uc131\uc774 2026\ub144 2nm \ubc18\ub3c4\uccb4 \uc591\uc0b0\uc5d0 \uc131\uacf5\ud560\uae4c\uc694?', 48, '2.3M'),
        ('\u26a1', '\uacfc\ud559&\uae30\uc220 \xb7 \uc5d0\ub108\uc9c0', 'LG\uc5d0\ub108\uc9c0\uc194\ub8e8\uc158\uc774 \uc804\uace0\uccb4 \ubc30\ud130\ub9ac \uc591\uc0b0\uc744 \ubc1c\ud45c\ud560\uae4c\uc694?', 41, '1.7M'),
        ('\U0001f4bb', '\uacfc\ud559&\uae30\uc220 \xb7 AI', '\ub124\uc774\ubc84 AI\uac00 GPT-4 \uc218\uc900\uc758 \ubca4\uce58\ub9c8\ud06c\ub97c \ub2ec\uc131\ud560\uae4c\uc694?', 55, '2.9M'),
        ('\U0001f331', '\uacfc\ud559&\uae30\uc220 \xb7 \uc5d0\ub108\uc9c0', '\ud55c\uad6d\uc774 2026\ub144 \ud575\uc735\ud569 \ubc1c\uc804 \uc2e4\ud5d8 \uc138\uacc4 \uae30\ub85d\uc744 \uc138\uc6b8\uae4c\uc694?', 29, '680K'),
        ('\U0001f697', '\uacfc\ud559&\uae30\uc220 \xb7 \uc790\uc728\uc8fc\ud589', '\uce74\uce74\uc624\uac00 2026\ub144 \uc790\uc728\uc8fc\ud589 \ud0dd\uc2dc \uc11c\ube44\uc2a4\ub97c \uc0c1\uc6a9\ud654\ud560\uae4c\uc694?', 36, '1.1M'),
    ], False),
    ('neighbor', '\ub098\uc758 \uc774\uc6c3', '\ub098\uc758 \uc774\uc6c3', [
        ('\U0001f3d8\ufe0f', '\ub098\uc758 \uc774\uc6c3 \xb7 \uc0c1\uad8c', '\uc6b0\ub9ac \ub3d9\ub124\uc5d0 2026\ub144 \uc2a4\ud0c0\ubc85\uc2a4\uac00 \uc0c8\ub85c \uc624\ud508\ud560\uae4c\uc694?', 52, '180K'),
        ('\U0001f68c', '\ub098\uc758 \uc774\uc6c3 \xb7 \uad50\ud1b5', '\uc6b0\ub9ac \uc9c0\uc5ed \ubc84\uc2a4 \ub178\uc120\uc774 2026\ub144 \uc0c1\ubc18\uae30 \uc99d\ud3b8\ub420\uae4c\uc694?', 61, '140K'),
        ('\U0001f3eb', '\ub098\uc758 \uc774\uc6c3 \xb7 \uad50\uc721', '\uc9c0\uc5ed \uc2e0\uc124 \ucd08\ub4f1\ud559\uad50\uac00 2026\ub144 \ucc29\uacf5\ub420\uae4c\uc694?', 45, '95K'),
        ('\U0001f333', '\ub098\uc758 \uc774\uc6c3 \xb7 \ud658\uacbd', '\ub3d9\ub124 \uacf5\uc6d0 \ub9ac\ubaa8\ub378\ub9c1\uc774 2026\ub144 \ub0b4 \uc644\uacf5\ub420\uae4c\uc694?', 58, '110K'),
        ('\U0001f3ea', '\ub098\uc758 \uc774\uc6c3 \xb7 \uc0c1\uad8c', '\uc6b0\ub9ac \uad6c\uc5d0 \ub300\ud615 \ubcf5\ud569\uc1fc\ud551\ubaf0\uc774 2026\ub144 \ucc29\uacf5\ub420\uae4c\uc694?', 33, '120K'),
        ('\U0001f4da', '\ub098\uc758 \uc774\uc6c3 \xb7 \ubb38\ud654', '\uc9c0\uc5ed \ub3c4\uc11c\uad00 \uc8fc\ub9d0 \uc6b4\uc601\uc2dc\uac04\uc774 2026\ub144 \uc5f0\uc7a5\ub420\uae4c\uc694?', 67, '88K'),
        ('\U0001f3d7\ufe0f', '\ub098\uc758 \uc774\uc6c3 \xb7 \uc7ac\uac1c\ubc1c', '\uc9c0\ud558\ucca0\uc5ed \uadfc\ucc98 \uc7ac\uac1c\ubc1c \uc0ac\uc5c5\uc774 2026\ub144 \uc2b9\uc778\ub420\uae4c\uc694?', 44, '160K'),
        ('\U0001f3e5', '\ub098\uc758 \uc774\uc6c3 \xb7 \uc758\ub8cc', '\ub3d9\ub124\uc5d0 \uc0c8\ub85c\uc6b4 \uc885\ud569\ubcd1\uc6d0\uc774 2026\ub144 \ucc29\uacf5\ub420\uae4c\uc694?', 37, '74K'),
    ], True),
]

new_html = ''.join(section_html(id_, title, display_title, cards_data, alt_bg)
                   for id_, title, display_title, cards_data, alt_bg in data)

insert_marker = '\n\n<!-- HOW IT WORKS -->'
content = content.replace(insert_marker, new_html + '\n<!-- HOW IT WORKS -->', 1)

with open('main.html', 'w', encoding='utf-8') as f:
    f.write(content)
print('Done, added', len(data), 'sections')
