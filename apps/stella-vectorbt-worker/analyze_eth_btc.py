import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

df = pd.read_csv('/Users/16-inchmacbook/development/crypto-stella/stella_platform_umbrella/apps/trade_engine/priv/ml/features_all_5yr.csv')
df = df[df['symbol'].isin(['ETHUSDT', 'BTCUSDT'])]

print('='*70)
print('ETH + BTC DEEP DIVE — 5 Years (691 trades)')
print('='*70)

for sym in ['ETHUSDT', 'BTCUSDT']:
    sub = df[df['symbol']==sym]
    t = len(sub)
    w = int(sub['win'].sum())
    wr = w/t*100
    pnl = sub['net_pnl'].sum()
    wp = sub[sub['net_pnl']>0]['net_pnl'].sum()
    lp = sub[sub['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    aw = sub[sub['win']==1]['net_pnl'].mean()
    al = sub[sub['win']==0]['net_pnl'].mean()
    print(f'\n{sym}: {t} trades, WR {wr:.1f}%, PnL ${pnl:.2f}, PF {pf:.2f}, Avg W ${aw:.2f} / L ${al:.2f}')

# ===== MOMENTUM-ATR RATIO ANALYSIS =====
print(f'\n{"="*70}')
print('MOMENTUM-ATR RATIO (MAR) — sweet spot analysis')
print('-'*70)
df['mar'] = abs(df['momentum']) / df['atr_pct']
bins = [0, 0.3, 0.35, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 100]
labels = ['<0.3', '0.3-0.35', '0.35-0.4', '0.4-0.5', '0.5-0.6', '0.6-0.7', '0.7-1.0', '1.0-1.5', '1.5-2.0', '2.0-3.0', '3.0+']
df['mar_bucket'] = pd.cut(df['mar'], bins=bins, labels=labels, right=False)
print(f'{"MAR":<12} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7} {"Avg W":>8} {"Avg L":>8}')
for b in labels:
    s = df[df['mar_bucket']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    aw = s[s['win']==1]['net_pnl'].mean() if w > 0 else 0
    al = s[s['win']==0]['net_pnl'].mean() if (t-w) > 0 else 0
    print(f'{b:<12} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f} ${aw:>7.2f} ${al:>7.2f}')

# ===== GRAVITY ANALYSIS =====
print(f'\n{"="*70}')
print('GRAVITY — market density analysis')
print('-'*70)
gbins = [0, 0.0001, 0.0002, 0.0003, 0.0005, 0.001, 0.002, 0.005, 0.01, 100]
glabels = ['<0.0001', '0.0001-0.0002', '0.0002-0.0003', '0.0003-0.0005', '0.0005-0.001', '0.001-0.002', '0.002-0.005', '0.005-0.01', '0.01+']
df['grav_bucket'] = pd.cut(df['gravity'], bins=gbins, labels=glabels, right=False)
print(f'{"Gravity":<16} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7}')
for b in glabels:
    s = df[df['grav_bucket']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<16} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

# ===== TRAJECTORY ANGLE =====
print(f'\n{"="*70}')
print('TRAJECTORY ANGLE')
print('-'*70)
df['abs_angle'] = abs(df['trajectory_angle'])
abins = [0, 10, 25, 45, 55, 65, 75, 85, 90.1]
alabels = ['<10', '10-25', '25-45', '45-55', '55-65', '65-75', '75-85', '85+']
df['angle_bucket'] = pd.cut(df['abs_angle'], bins=abins, labels=alabels, right=False)
print(f'{"Angle":<10} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7}')
for b in alabels:
    s = df[df['angle_bucket']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<10} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

# ===== KINETIC ENERGY =====
print(f'\n{"="*70}')
print('KINETIC ENERGY')
print('-'*70)
ke_pcts = [0, 10, 25, 50, 75, 90, 95, 99, 100.1]
ke_labels = ['p0-10', 'p10-25', 'p25-50', 'p50-75', 'p75-90', 'p90-95', 'p95-99', 'p99+']
df['ke_bucket'] = pd.cut(df['kinetic_energy'].rank(pct=True)*100, bins=ke_pcts, labels=ke_labels, right=False)
print(f'{"KE Pctile":<10} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7}')
for b in ke_labels:
    s = df[df['ke_bucket']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<10} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

# ===== ENERGY STATE =====
print(f'\n{"="*70}')
print('ENERGY STATE')
print('-'*70)
for es in df['energy_state'].unique():
    s = df[df['energy_state']==es]
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{es:<10} {t:>7} trades, WR {wr:>5.1f}%, PnL ${pnl:>8.2f}, PF {pf:.2f}')

# ===== REGIME =====
print(f'\n{"="*70}')
print('MARKET REGIME')
print('-'*70)
for r in df['regime'].unique():
    s = df[df['regime']==r]
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{r:<20} {t:>5} trades, WR {wr:>5.1f}%, PnL ${pnl:>8.2f}, PF {pf:.2f}')

# ===== DIRECTION + REGIME =====
print(f'\n{"="*70}')
print('DIRECTION x REGIME')
print('-'*70)
for d in ['long', 'short']:
    for r in sorted(df['regime'].unique()):
        s = df[(df['direction']==d) & (df['regime']==r)]
        if len(s) < 5: continue
        t = len(s)
        w = int(s['win'].sum())
        wr = w/t*100
        pnl = s['net_pnl'].sum()
        wp = s[s['net_pnl']>0]['net_pnl'].sum()
        lp = s[s['net_pnl']<0]['net_pnl'].sum()
        pf = abs(wp/lp) if lp != 0 else 0
        print(f'{d.upper():<6} + {r:<16} {t:>5} trades, WR {wr:>5.1f}%, PnL ${pnl:>8.2f}, PF {pf:.2f}')

# ===== HOLD DURATION =====
print(f'\n{"="*70}')
print('HOLD DURATION')
print('-'*70)
dbins = [0, 15, 30, 60, 90, 120, 121]
dlabels = ['<15m', '15-30m', '30-60m', '60-90m', '90-120m', '120m']
df['dur_bucket'] = pd.cut(df['duration_minutes'], bins=dbins, labels=dlabels, right=False)
print(f'{"Duration":<10} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7}')
for b in dlabels:
    s = df[df['dur_bucket']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<10} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

# ===== MOMENTUM ACCELERATION =====
print(f'\n{"="*70}')
print('MOMENTUM ACCELERATION')
print('-'*70)
ma_pcts = [0, 10, 25, 50, 75, 90, 100.1]
ma_labels = ['p0-10', 'p10-25', 'p25-50', 'p50-75', 'p75-90', 'p90+']
df['ma_bucket'] = pd.cut(df['momentum_acceleration'].rank(pct=True)*100, bins=ma_pcts, labels=ma_labels, right=False)
print(f'{"Accel Pct":<10} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7}')
for b in ma_labels:
    s = df[df['ma_bucket']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<10} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

# ===== PER-ASSET CONFIDENCE =====
print(f'\n{"="*70}')
print('ETH CONFIDENCE BUCKETS')
print('-'*70)
eth = df[df['symbol']=='ETHUSDT']
cbins = [0, 55, 60, 65, 70, 75, 80, 85, 90, 100]
clabels = ['<55', '55-60', '60-65', '65-70', '70-75', '75-80', '80-85', '85-90', '90+']
eth_c = eth.copy()
eth_c['cb'] = pd.cut(eth_c['confidence'], bins=cbins, labels=clabels, right=False)
for b in clabels:
    s = eth_c[eth_c['cb']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<10} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

print(f'\n{"="*70}')
print('BTC CONFIDENCE BUCKETS')
print('-'*70)
btc = df[df['symbol']=='BTCUSDT']
btc_c = btc.copy()
btc_c['cb'] = pd.cut(btc_c['confidence'], bins=cbins, labels=clabels, right=False)
for b in clabels:
    s = btc_c[btc_c['cb']==b]
    if len(s) == 0: continue
    t = len(s)
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    print(f'{b:<10} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f}')

# ===== WINNING COMBO SEARCH =====
print(f'\n{"="*70}')
print('BEST FILTER COMBINATIONS')
print('-'*70)

combos = []

# Try different MAR ranges
for mar_lo in [0.3, 0.35, 0.4, 0.5]:
    for mar_hi in [1.0, 1.5, 2.0, 3.0]:
        if mar_lo >= mar_hi: continue
        for conf_min in [60, 63, 65, 68, 70]:
            for grav_max in [0.001, 0.002, 0.005, 100]:
                s = df[
                    (df['mar'] >= mar_lo) &
                    (df['mar'] < mar_hi) &
                    (df['confidence'] >= conf_min) &
                    (df['gravity'] < grav_max)
                ]
                if len(s) < 30: continue
                t = len(s)
                w = int(s['win'].sum())
                wr = w/t*100
                pnl = s['net_pnl'].sum()
                wp = s[s['net_pnl']>0]['net_pnl'].sum()
                lp = s[s['net_pnl']<0]['net_pnl'].sum()
                pf = abs(wp/lp) if lp != 0 else 0
                if pf > 1.0:
                    combos.append((pf, wr, pnl, t, mar_lo, mar_hi, conf_min, grav_max))

combos.sort(key=lambda x: (-x[0], -x[3]))
print(f'{"PF":>6} {"WR%":>6} {"PnL":>9} {"N":>5}  Filters')
print('-'*70)
for pf, wr, pnl, t, ml, mh, cm, gm in combos[:25]:
    gstr = f'grav<{gm}' if gm < 100 else 'any grav'
    print(f'{pf:>5.2f} {wr:>5.1f}% ${pnl:>7.2f} {t:>5}  MAR {ml}-{mh}, conf>={cm}, {gstr}')
