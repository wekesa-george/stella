import pandas as pd
import warnings
warnings.filterwarnings('ignore')

df = pd.read_csv('/Users/16-inchmacbook/development/crypto-stella/stella_platform_umbrella/apps/trade_engine/priv/ml/features_all_5yr.csv')

print('='*70)
print('5-YEAR BACKTEST RESULTS (Apr 2021 - Mar 2026)')
print('='*70)

total = len(df)
wins = int(df['win'].sum())
losses = total - wins
wr = wins/total*100
avg_win = df[df['win']==1]['net_pnl'].mean()
avg_loss = df[df['win']==0]['net_pnl'].mean()
total_pnl = df['net_pnl'].sum()
wins_pnl = df[df['net_pnl']>0]['net_pnl'].sum()
loss_pnl = df[df['net_pnl']<0]['net_pnl'].sum()
pf = abs(wins_pnl/loss_pnl) if loss_pnl != 0 else 0

print()
print(f'Total Trades: {total}')
print(f'Wins: {wins} | Losses: {losses}')
print(f'Win Rate: {wr:.1f}%')
print(f'Avg Win: ${avg_win:.2f} | Avg Loss: ${avg_loss:.2f}')
print(f'Total PnL: ${total_pnl:.2f}')
print(f'Profit Factor: {pf:.2f}')
print(f'Avg R:R: {abs(avg_win/avg_loss):.2f}')

# Per asset
print()
print('='*70)
header = f'{"Asset":<10} {"Trades":>7} {"Wins":>6} {"WR%":>7} {"PnL":>10} {"PF":>7} {"Avg Win":>9} {"Avg Loss":>9}'
print(header)
print('-'*70)

for sym in sorted(df['symbol'].unique()):
    sub = df[df['symbol']==sym]
    t = len(sub)
    w = int(sub['win'].sum())
    wr2 = w/t*100
    pnl = sub['net_pnl'].sum()
    aw = sub[sub['win']==1]['net_pnl'].mean() if w > 0 else 0
    al = sub[sub['win']==0]['net_pnl'].mean() if (t-w) > 0 else 0
    wp = sub[sub['net_pnl']>0]['net_pnl'].sum()
    lp = sub[sub['net_pnl']<0]['net_pnl'].sum()
    pf2 = abs(wp/lp) if lp != 0 else 0
    print(f'{sym:<10} {t:>7} {w:>6} {wr2:>6.1f}% ${pnl:>8.2f} {pf2:>6.2f} ${aw:>7.2f} ${al:>7.2f}')

# By direction
print()
print('='*70)
print('BY DIRECTION')
print('-'*70)
for d in ['long', 'short']:
    sub = df[df['direction']==d]
    if len(sub) == 0:
        continue
    t = len(sub)
    w = int(sub['win'].sum())
    wr2 = w/t*100
    pnl = sub['net_pnl'].sum()
    print(f'{d.upper():<10} {t:>7} trades, {w:>5} wins, WR {wr2:>5.1f}%, PnL ${pnl:>9.2f}')

# By confidence bucket
print()
print('='*70)
print('BY CONFIDENCE BUCKET')
print('-'*70)
bins = [0, 50, 55, 60, 65, 70, 75, 80, 85, 90, 100]
df['conf_bucket'] = pd.cut(df['confidence'], bins=bins, right=False)
for bucket in sorted(df['conf_bucket'].dropna().unique()):
    sub = df[df['conf_bucket'] == bucket]
    if len(sub) == 0:
        continue
    t = len(sub)
    w = int(sub['win'].sum())
    wr2 = w/t*100
    pnl = sub['net_pnl'].sum()
    print(f'  {str(bucket):<12} {t:>5} trades, WR {wr2:>5.1f}%, PnL ${pnl:>9.2f}')

# By exit reason
print()
print('='*70)
print('BY EXIT REASON')
print('-'*70)
for reason in df['reason'].value_counts().index:
    sub = df[df['reason'] == reason]
    t = len(sub)
    w = int(sub['win'].sum())
    wr2 = w/t*100
    pnl = sub['net_pnl'].sum()
    print(f'  {reason:<20} {t:>5} trades, WR {wr2:>5.1f}%, PnL ${pnl:>9.2f}')

# Per asset + direction breakdown
print()
print('='*70)
print('PER ASSET + DIRECTION')
print('-'*70)
for sym in sorted(df['symbol'].unique()):
    for d in ['long', 'short']:
        sub = df[(df['symbol']==sym) & (df['direction']==d)]
        if len(sub) == 0:
            continue
        t = len(sub)
        w = int(sub['win'].sum())
        wr2 = w/t*100
        pnl = sub['net_pnl'].sum()
        print(f'  {sym:<10} {d:<6} {t:>5} trades, WR {wr2:>5.1f}%, PnL ${pnl:>8.2f}')
