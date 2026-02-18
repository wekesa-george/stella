"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

const tradeHistory = [
  {
    id: "1",
    account: "0x17d****0qbD",
    height: "8,912,938",
    hash: "0u3fCE83****b3fz9771",
    inToken: "BUSD",
    inAmount: "$",
    outToken: "USDT",
    outAmount: "4.99865659355664",
    age: "14d 19h ago",
  },
  {
    id: "2",
    account: "0x17d****0qbD",
    height: "8,908,553",
    hash: "0ac9e7CE4****xA508647",
    inToken: "UNI",
    inAmount: "1",
    outToken: "DOGE",
    outAmount: "90.32858625",
    age: "16d 22h ago",
  },
  {
    id: "3",
    account: "0x17d****0qbD",
    height: "8,907,877",
    hash: "0xcb2d72F9****087x002",
    inToken: "BUSD",
    inAmount: "22",
    outToken: "UNI",
    outAmount: "1.035372853910143",
    age: "18d 4h ago",
  },
  {
    id: "4",
    account: "0x17d****0qbD",
    height: "8,334,123",
    hash: "0x15bneaA0****1854nbh2",
    inToken: "CAKE",
    inAmount: "1",
    outToken: "BUSD",
    outAmount: "18.77604298817733",
    age: "20d 1h ago",
  },
  {
    id: "5",
    account: "0x17d****0qbD",
    height: "8,548,407",
    hash: "0xddda5cnn4****e888p207",
    inToken: "UNI",
    inAmount: "15",
    outToken: "DOGE",
    outAmount: "451.64203125",
    age: "21d 4h ago",
  },
];

export function TradeHistory() {
  return (
    <Card className="border-border/40 bg-card">
      <CardHeader>
        <CardTitle className="text-lg">Your trade history</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="text-xs text-muted-foreground">
                  Account
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  Height
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  Hash
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  InToken
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  InAmount
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  OutToken
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  OutAmount
                </TableHead>
                <TableHead className="text-xs text-muted-foreground">
                  Age
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tradeHistory.map((trade) => (
                <TableRow
                  key={trade.id}
                  className="border-border hover:bg-muted/50"
                >
                  <TableCell className="text-xs">
                    <button className="text-primary hover:underline">
                      {trade.account}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {trade.height}
                  </TableCell>
                  <TableCell className="text-xs">
                    <button className="text-primary hover:underline">
                      {trade.hash}
                    </button>
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge
                      variant="secondary"
                      className="bg-muted text-foreground"
                    >
                      {trade.inToken}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {trade.inAmount}
                  </TableCell>
                  <TableCell className="text-xs">
                    <Badge
                      variant="secondary"
                      className="bg-muted text-foreground"
                    >
                      {trade.outToken}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-foreground">
                    {trade.outAmount}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {trade.age}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
