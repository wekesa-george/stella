import pandas as pd
import warnings
warnings.filterwarnings('ignore')

df = pd.read_csv('/Users/16-inchmacbook/development/crypto-stella/stella_platform_umbrella/apps/trade_engine/priv/ml/features_all_5yr.csv')

def report(label, sub):
    t = len(sub)
    if t == 0:
        print(f'\n{label}: NO TRADES')
        return
    w = int(sub['win'].sum())
    l = t - w
    wr = w/t*100
    avg_w = sub[sub['win']==1]['net_pnl'].mean() if w > 0 else 0
    avg_l = sub[sub['win']==0]['net_pnl'].mean() if l > 0 else 0
    total_pnl = sub['net_pnl'].sum()
    wp = sub[sub['net_pnl']>0]['net_pnl'].sum()
    lp = sub[sub['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    rr = abs(avg_w/avg_l) if avg_l != 0 else 0

    print(f'\n{"="*70}')
    print(f'{label}')
    print(f'{"="*70}')
    print(f'Trades: {t} | Wins: {w} | Losses: {l}')
    print(f'Win Rate: {wr:.1f}%')
    print(f'Total PnL: ${total_pnl:.2f}')
    print(f'Profit Factor: {pf:.2f}')
    print(f'Avg Win: ${avg_w:.2f} | Avg Loss: ${avg_l:.2f} | R:R: {rr:.2f}')

    # Per asset
    print(f'\n  {"Asset":<10} {"Trades":>7} {"Wins":>6} {"WR%":>7} {"PnL":>10} {"PF":>7}')
    print(f'  {"-"*50}')
    for sym in sorted(sub['symbol'].unique()):
        s = sub[sub['symbol']==sym]
        st = len(s)
        sw = int(s['win'].sum())
        swr = sw/st*100
        spnl = s['net_pnl'].sum()
        swp = s[s['net_pnl']>0]['net_pnl'].sum()
        slp = s[s['net_pnl']<0]['net_pnl'].sum()
        spf = abs(swp/slp) if slp != 0 else 0
        print(f'  {sym:<10} {st:>7} {sw:>6} {swr:>6.1f}% ${spnl:>8.2f} {spf:>6.2f}')

    # By direction
    print()
    for d in ['long', 'short']:
        s = sub[sub['direction']==d]
        if len(s) == 0: continue
        st = len(s)
        sw = int(s['win'].sum())
        swr = sw/st*100
        spnl = s['net_pnl'].sum()
        print(f'  {d.upper():<10} {st:>5} trades, WR {swr:>5.1f}%, PnL ${spnl:>8.2f}')

    # By confidence bucket
    print()
    bins = [0, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100]
    sub2 = sub.copy()
    sub2['conf_bucket'] = pd.cut(sub2['confidence'], bins=bins, right=False)
    for bucket in sorted(sub2['conf_bucket'].dropna().unique()):
        s = sub2[sub2['conf_bucket']==bucket]
        if len(s) == 0: continue
        st = len(s)
        sw = int(s['win'].sum())
        swr = sw/st*100
        spnl = s['net_pnl'].sum()
        print(f'  Conf {str(bucket):<12} {st:>5} trades, WR {swr:>5.1f}%, PnL ${spnl:>8.2f}')

    # By exit reason
    print()
    for reason in sub['reason'].value_counts().index:
        s = sub[sub['reason']==reason]
        st = len(s)
        sw = int(s['win'].sum())
        swr = sw/st*100
        spnl = s['net_pnl'].sum()
        print(f'  {reason:<20} {st:>5} trades, WR {swr:>5.1f}%, PnL ${spnl:>8.2f}')


# ===== BASELINE =====
report('BASELINE (all assets, conf >= 60)', df)

# ===== SCENARIO A: Raise min confidence to 65 =====
a = df[df['confidence'] >= 65]
report('SCENARIO A: Min confidence 65 (all assets)', a)

# ===== SCENARIO B: Only ETH + BTC =====
b = df[df['symbol'].isin(['ETHUSDT', 'BTCUSDT'])]
report('SCENARIO B: Only ETH + BTC (conf >= 60)', b)

# ===== SCENARIO C: Both — ETH + BTC, conf >= 65 =====
c = df[(df['symbol'].isin(['ETHUSDT', 'BTCUSDT'])) & (df['confidence'] >= 65)]
report('SCENARIO C: ETH + BTC only, conf >= 65', c)

# ===== SCENARIO D: ETH + BTC + BNB, conf >= 65 =====
d = df[(df['symbol'].isin(['ETHUSDT', 'BTCUSDT', 'BNBUSDT'])) & (df['confidence'] >= 65)]
report('SCENARIO D: ETH + BTC + BNB, conf >= 65', d)

# ===== SCENARIO E: Only conf 65-75 (sweet spot) =====
e = df[(df['confidence'] >= 65) & (df['confidence'] < 75)]
report('SCENARIO E: Conf 65-75 sweet spot (all assets)', e)

# ===== SCENARIO F: ETH + BTC, conf 65-75 =====
f = df[(df['symbol'].isin(['ETHUSDT', 'BTCUSDT'])) & (df['confidence'] >= 65) & (df['confidence'] < 75)]
report('SCENARIO F: ETH + BTC, conf 65-75 (tightest filter)', f)

# ===== SCENARIO G: Exclude DOGE/XRP/SOL, conf >= 65 =====
g = df[(~df['symbol'].isin(['DOGEUSDT', 'XRPUSDT', 'SOLUSDT'])) & (df['confidence'] >= 65)]
report('SCENARIO G: Exclude DOGE/XRP/SOL, conf >= 65', g)

# Summary comparison
print('\n' + '='*70)
print('SUMMARY COMPARISON')
print('='*70)
scenarios = [
    ('Baseline', df),
    ('A: conf>=65', a),
    ('B: ETH+BTC only', b),
    ('C: ETH+BTC, conf>=65', c),
    ('D: ETH+BTC+BNB, conf>=65', d),
    ('E: conf 65-75 all', e),
    ('F: ETH+BTC, 65-75', f),
    ('G: no DOGE/XRP/SOL, 65', g),
]

print(f'\n{"Scenario":<28} {"Trades":>7} {"WR%":>7} {"PnL":>10} {"PF":>7} {"R:R":>6}')
print('-'*70)
for name, s in scenarios:
    t = len(s)
    if t == 0: continue
    w = int(s['win'].sum())
    wr = w/t*100
    pnl = s['net_pnl'].sum()
    wp = s[s['net_pnl']>0]['net_pnl'].sum()
    lp = s[s['net_pnl']<0]['net_pnl'].sum()
    pf = abs(wp/lp) if lp != 0 else 0
    aw = s[s['win']==1]['net_pnl'].mean() if w > 0 else 0
    al = s[s['win']==0]['net_pnl'].mean() if (t-w) > 0 else 0
    rr = abs(aw/al) if al != 0 else 0
    print(f'{name:<28} {t:>7} {wr:>6.1f}% ${pnl:>8.2f} {pf:>6.2f} {rr:>5.2f}')
