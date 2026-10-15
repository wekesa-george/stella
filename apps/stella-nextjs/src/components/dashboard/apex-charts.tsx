"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { ApexOptions } from "apexcharts";

const Chart = dynamic(() => import("react-apexcharts"), { ssr: false });

export function RevenueChart() {
  const [options] = useState<ApexOptions>({
    chart: {
      type: "area",
      height: 350,
      toolbar: { show: false },
      background: "transparent",
      zoom: { enabled: false },
    },
    theme: { mode: "dark" },
    dataLabels: { enabled: false },
    stroke: {
      curve: "smooth",
      width: 2,
      colors: ["#c4f563"],
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1,
        stops: [0, 90, 100],
      },
      colors: ["#c4f563"],
    },
    xaxis: {
      categories: Array.from({ length: 30 }, (_, i) => `${i + 1}`),
      labels: {
        style: { colors: "#888" },
        formatter: (val) => {
          const num = parseInt(String(val));
          if ([1, 5, 9, 13, 17, 21, 25, 29].includes(num)) return String(val);
          if (num === 30) return "Now";
          return "";
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: "#888" },
        formatter: (val) => `${val}`,
      },
    },
    grid: {
      borderColor: "#2a2a2a",
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    tooltip: {
      theme: "dark",
      x: { show: false },
    },
    colors: ["#c4f563"],
  });

  const [series] = useState([
    {
      name: "Revenue",
      data: [
        50, 55, 57, 62, 65, 70, 72, 75, 78, 85, 90, 95, 100, 105, 110, 115,
        120, 130, 140, 150, 160, 170, 175, 180, 185, 190, 195, 198, 200, 205,
      ],
    },
  ]);

  return (
    <Chart options={options} series={series} type="area" height={350} />
  );
}

export function VolumeChart() {
  const [options] = useState<ApexOptions>({
    chart: {
      type: "area",
      height: 350,
      toolbar: { show: false },
      background: "transparent",
      zoom: { enabled: false },
    },
    theme: { mode: "dark" },
    dataLabels: { enabled: false },
    stroke: {
      curve: "smooth",
      width: 2,
      colors: ["#c4f563"],
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1,
        stops: [0, 90, 100],
      },
      colors: ["#c4f563"],
    },
    xaxis: {
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      labels: { style: { colors: "#888" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: "#888" },
        formatter: (val) => `${val.toFixed(2)}`,
      },
    },
    grid: {
      borderColor: "#2a2a2a",
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    tooltip: {
      theme: "dark",
      x: { show: true },
    },
    colors: ["#c4f563"],
  });

  const [series] = useState([
    {
      name: "Volume",
      data: [1.2, 1.4, 1.5, 1.6, 1.7, 1.9, 2.0, 2.1, 2.0, 2.1, 2.3, 2.4],
    },
  ]);

  return (
    <Chart options={options} series={series} type="area" height={350} />
  );
}

export function UserGrowthChart() {
  const [options] = useState<ApexOptions>({
    chart: {
      type: "area",
      height: 350,
      toolbar: { show: false },
      background: "transparent",
      stacked: false,
      zoom: { enabled: false },
    },
    theme: { mode: "dark" },
    dataLabels: { enabled: false },
    stroke: {
      curve: "smooth",
      width: 2,
      colors: ["#c4f563", "#4ade80"],
    },
    fill: {
      type: "gradient",
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.1,
        stops: [0, 90, 100],
      },
      colors: ["#c4f563", "#4ade80"],
    },
    legend: {
      show: true,
      position: "top",
      horizontalAlign: "left",
      labels: { colors: "#888" },
    },
    xaxis: {
      categories: [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ],
      labels: { style: { colors: "#888" } },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: "#888" },
        formatter: (val) => `${(val / 1000).toFixed(0)}k`,
      },
    },
    grid: {
      borderColor: "#2a2a2a",
      strokeDashArray: 0,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    tooltip: {
      theme: "dark",
      shared: true,
      intersect: false,
    },
    colors: ["#c4f563", "#4ade80"],
  });

  const [series] = useState([
    {
      name: "Total Users",
      data: [
        3000, 4000, 5500, 7000, 8500, 9800, 11000, 12000, 13500, 14500, 15800,
        17000,
      ],
    },
    {
      name: "Active Traders",
      data: [
        2000, 2800, 3500, 4500, 5500, 6300, 7200, 8000, 9000, 9800, 10500,
        11500,
      ],
    },
  ]);

  return (
    <Chart options={options} series={series} type="area" height={350} />
  );
}

export function TradingPairsDonut() {
  const [options] = useState<ApexOptions>({
    chart: {
      type: "donut",
      height: 350,
      background: "transparent",
    },
    theme: { mode: "dark" },
    labels: ["BTC/USDT", "ETH/USDT", "SOL/USDT", "Others"],
    colors: ["#c4f563", "#4ade80", "#fbbf24", "#60a5fa"],
    legend: {
      show: true,
      position: "right",
      labels: { colors: "#888" },
      formatter: (seriesName, opts) => {
        const val = opts.w.globals.series[opts.seriesIndex];
        const total = opts.w.globals.series.reduce(
          (a: number, b: number) => a + b,
          0
        );
        const percent = ((val / total) * 100).toFixed(0);
        const values = ["$1.2M", "$672K", "$312K", "$216K"];
        return `<span class="text-sm">${seriesName}</span><br/><span class="text-xs text-gray-400">${values[opts.seriesIndex]}</span><br/><span class="text-xs font-medium">${percent}%</span>`;
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: "70%",
          labels: {
            show: true,
            total: {
              show: true,
              label: "24h Volume",
              fontSize: "14px",
              color: "#888",
              formatter: () => "100",
            },
            value: {
              fontSize: "28px",
              fontWeight: 600,
              color: "#fff",
            },
          },
        },
      },
    },
    dataLabels: { enabled: false },
    stroke: { show: false },
    tooltip: {
      theme: "dark",
      y: {
        formatter: (val) => `${val}%`,
      },
    },
  });

  const [series] = useState([50, 28, 13, 9]);

  return (
    <Chart options={options} series={series} type="donut" height={350} />
  );
}
