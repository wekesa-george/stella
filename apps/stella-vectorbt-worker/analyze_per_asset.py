import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

df = pd.read_csv('/Users/16-inchmacbook/development/crypto-stella/stella_platform_umbrella/apps/trade_engine/priv/ml/features_all_5yr.csv')
df['mar'] = abs(df['momentum']) / df['atr_pct']
df['abs_angle'] = abs(df['trajectory_angle'])
df['ke_pct'] = df.groupby('symbol')['kinetic_energy'].rank(pct=True) * 100

def report_section(label, sub):
    t = len(sub)
    if t == 0:
        return
    w = int(sub['win'].sum())
    wr = w/t*100
    pnl = sub['net_pnl'].sum()
    wp = sub[sub['net_pnl']>0]['net_pnl'].sum()
    lp = sub[sub['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    aw = sub[sub['win']==1]['net_pnl'].mean() if w > 0 else 0
    al = sub[sub['win']==0]['net_pnl'].mean() if (t-w) > 0 else 0
    rr = abs(aw/al) if al != 0 else 0
    print(f'  {label:<16} {t:>5} trades, WR {wr:>5.1f}%, PnL ${pnl:>8.2f}, PF {pf:.2f}, R:R {rr:.2f}')

for sym in sorted(df['symbol'].unique()):
    asset = df[df['symbol']==sym]
    t = len(asset)
    w = int(asset['win'].sum())
    wr = w/t*100
    pnl = asset['net_pnl'].sum()
    wp = asset[asset['net_pnl']>0]['net_pnl'].sum()
    lp = asset[asset['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    aw = asset[asset['win']==1]['net_pnl'].mean() if w > 0 else 0
    al = asset[asset['win']==0]['net_pnl'].mean() if (t-w) > 0 else 0

    print(f'\n{"="*70}')
    print(f'{sym} — {t} trades, WR {wr:.1f}%, PnL ${pnl:.2f}, PF {pf:.2f}')
    print(f'Avg Win ${aw:.2f} | Avg Loss ${al:.2f}')
    print(f'{"="*70}')

    # Confidence
    print(f'\n  CONFIDENCE')
    cbins = [0, 55, 60, 65, 70, 75, 80, 85, 90, 100]
    clabels = ['<55','55-60','60-65','65-70','70-75','75-80','80-85','85-90','90+']
    ac = asset.copy()
    ac['cb'] = pd.cut(ac['confidence'], bins=cbins, labels=clabels, right=False)
    for b in clabels:
        s = ac[ac['cb']==b]
        if len(s) == 0: continue
        report_section(f'Conf {b}', s)

    # MAR
    print(f'\n  MOMENTUM-ATR RATIO')
    mbins = [0, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 1.0, 2.0, 100]
    mlabels = ['<0.3','0.3-0.35','0.35-0.4','0.4-0.5','0.5-0.6','0.6-0.7','0.7-1.0','1.0-2.0','2.0+']
    ac['mb'] = pd.cut(ac['mar'], bins=mbins, labels=mlabels, right=False)
    for b in mlabels:
        s = ac[ac['mb']==b]
        if len(s) == 0: continue
        report_section(f'MAR {b}', s)

    # Gravity
    print(f'\n  GRAVITY')
    gbins = [0, 0.0002, 0.0003, 0.0005, 0.001, 0.002, 0.005, 100]
    glabels = ['<0.0002','0.0002-3','0.0003-5','0.0005-1','0.001-2','0.002-5','0.005+']
    ac['gb'] = pd.cut(ac['gravity'], bins=gbins, labels=glabels, right=False)
    for b in glabels:
        s = ac[ac['gb']==b]
        if len(s) == 0: continue
        report_section(b, s)

    # Angle
    print(f'\n  TRAJECTORY ANGLE')
    abins = [0, 25, 45, 55, 65, 75, 85, 90.1]
    alabels = ['<25','25-45','45-55','55-65','65-75','75-85','85+']
    ac['ab'] = pd.cut(ac['abs_angle'], bins=abins, labels=alabels, right=False)
    for b in alabels:
        s = ac[ac['ab']==b]
        if len(s) == 0: continue
        report_section(f'Angle {b}', s)

    # KE percentile
    print(f'\n  KINETIC ENERGY (percentile)')
    kbins = [0, 25, 50, 75, 90, 100.1]
    klabels = ['p0-25','p25-50','p50-75','p75-90','p90+']
    ac['kb'] = pd.cut(ac['ke_pct'], bins=kbins, labels=klabels, right=False)
    for b in klabels:
        s = ac[ac['kb']==b]
        if len(s) == 0: continue
        report_section(f'KE {b}', s)

    # Energy state
    print(f'\n  ENERGY STATE')
    for es in sorted(asset['energy_state'].unique()):
        report_section(es, asset[asset['energy_state']==es])

    # Regime
    print(f'\n  MARKET REGIME')
    for r in sorted(asset['regime'].unique()):
        report_section(r, asset[asset['regime']==r])

    # Direction
    print(f'\n  DIRECTION')
    for d in ['long', 'short']:
        s = asset[asset['direction']==d]
        if len(s) == 0: continue
        report_section(d.upper(), s)

    # Hold duration
    print(f'\n  HOLD DURATION')
    dbins = [0, 15, 30, 60, 90, 120, 121]
    dlabels = ['<15m','15-30m','30-60m','60-90m','90-120m','120m']
    ac['db'] = pd.cut(ac['duration_minutes'], bins=dbins, labels=dlabels, right=False)
    for b in dlabels:
        s = ac[ac['db']==b]
        if len(s) == 0: continue
        report_section(b, s)

    # Exit reason
    print(f'\n  EXIT REASON')
    for r in asset['reason'].value_counts().index:
        report_section(r, asset[asset['reason']==r])


# ===================================================================
# NOW APPLY FILTERS AND SIMULATE
# ===================================================================
print(f'\n\n{"#"*70}')
print(f'# FILTERED SIMULATIONS')
print(f'{"#"*70}')

# Filter 1: MAR >= 0.4
# Filter 2: Hold >= 30min (exclude trades that closed in <30m, except SL hits which we can't control)
# Filter 3: KE percentile 50-95 (not too low, not overextended)

filters = [
    ('Baseline', lambda d: d),
    ('MAR >= 0.4', lambda d: d[d['mar'] >= 0.4]),
    ('Hold >= 30m (non-SL)', lambda d: d[(d['duration_minutes'] >= 30) | (d['reason'] == 'stop_loss')]),
    ('KE p50-95', lambda d: d[(d['ke_pct'] >= 50) & (d['ke_pct'] < 95)]),
    ('MAR>=0.4 + Hold>=30m', lambda d: d[(d['mar'] >= 0.4) & ((d['duration_minutes'] >= 30) | (d['reason'] == 'stop_loss'))]),
    ('MAR>=0.4 + KE p50-95', lambda d: d[(d['mar'] >= 0.4) & (d['ke_pct'] >= 50) & (d['ke_pct'] < 95)]),
    ('All 3 filters', lambda d: d[
        (d['mar'] >= 0.4) &
        ((d['duration_minutes'] >= 30) | (d['reason'] == 'stop_loss')) &
        (d['ke_pct'] >= 50) & (d['ke_pct'] < 95)
    ]),
    ('MAR>=0.4 + KE p75-90', lambda d: d[(d['mar'] >= 0.4) & (d['ke_pct'] >= 75) & (d['ke_pct'] < 90)]),
    ('MAR>=0.4 + Hold>=30m + KE p75-90', lambda d: d[
        (d['mar'] >= 0.4) &
        ((d['duration_minutes'] >= 30) | (d['reason'] == 'stop_loss')) &
        (d['ke_pct'] >= 75) & (d['ke_pct'] < 90)
    ]),
]

for sym in sorted(df['symbol'].unique()):
    asset = df[df['symbol']==sym]
    print(f'\n{"="*70}')
    print(f'{sym} — FILTER SIMULATIONS')
    print(f'{"="*70}')
    print(f'{"Filter":<35} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7} {"R:R":>6}')
    print('-'*70)

    for name, fn in filters:
        s = fn(asset)
        t = len(s)
        if t == 0:
            print(f'{name:<35} {"—":>7}')
            continue
        w = int(s['win'].sum())
        wr = w/t*100
        pnl = s['net_pnl'].sum()
        wp = s[s['net_pnl']>0]['net_pnl'].sum()
        lp = s[s['net_pnl']<0]['net_pnl'].sum()
        pf = abs(wp/lp) if lp != 0 else 0
        aw = s[s['win']==1]['net_pnl'].mean() if w > 0 else 0
        al = s[s['win']==0]['net_pnl'].mean() if (t-w) > 0 else 0
        rr = abs(aw/al) if al != 0 else 0
        print(f'{name:<35} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f} {rr:>5.2f}')
