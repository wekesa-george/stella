import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const topTraders = [
  {
    id: 1,
    name: "Sarah Chen",
    username: "@crypto_queen",
    avatar: "S",
    avatarColor: "bg-purple-500",
    followers: "2,341",
    performance: "+45.2%",
    volume: "$1.2M",
  },
  {
    id: 2,
    name: "Michael Torres",
    username: "@btc_master",
    avatar: "M",
    avatarColor: "bg-blue-500",
    followers: "1,892",
    performance: "+38.7%",
    volume: "$890K",
  },
  {
    id: 3,
    name: "Emma Wilson",
    username: "@eth_trader",
    avatar: "E",
    avatarColor: "bg-green-500",
    followers: "1,654",
    performance: "+32.1%",
    volume: "$745K",
  },
];

export function TopTraders() {
  return (
    <Card className="border-border/40 bg-card">
      <CardHeader>
        <CardTitle className="text-lg font-semibold">
          Top Performing Traders
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow className="border-border/40 hover:bg-transparent">
              <TableHead className="text-xs text-muted-foreground">
                Trader
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                Followers
              </TableHead>
              <TableHead className="text-xs text-muted-foreground">
                30d Performance
              </TableHead>
              <TableHead className="text-xs text-muted-foreground text-right">
                Total Volume
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {topTraders.map((trader) => (
              <TableRow
                key={trader.id}
                className="border-border/40 hover:bg-muted/50"
              >
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full ${trader.avatarColor} text-sm font-semibold text-white`}
                    >
                      {trader.avatar}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">
                        {trader.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {trader.username}
                      </span>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm">{trader.followers}</TableCell>
                <TableCell>
                  <span className="text-sm font-medium text-primary">
                    {trader.performance}
                  </span>
                </TableCell>
                <TableCell className="text-right text-sm font-medium">
                  {trader.volume}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
