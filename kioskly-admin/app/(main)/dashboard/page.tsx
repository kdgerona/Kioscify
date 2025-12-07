'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import {
  TrendingUp,
  Receipt,
  DollarSign,
  Package,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useTenant } from '@/contexts/TenantContext';

interface Stats {
  totalSales: number;
  totalTransactions: number;
  averageOrderValue: number;
  topProducts: Array<{
    product: { id: string; name: string };
    totalSold: number;
    revenue: number;
  }>;
}

export default function DashboardPage() {
  const { tenant } = useTenant();
  const primaryColor = tenant?.themeColors?.primary || '#4f46e5';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const statsData = await api.getTransactionStats();
      setStats(statsData);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: 'Total Sales',
      value: formatCurrency(stats?.totalSales || 0),
      icon: DollarSign,
      bgColor: 'bg-green-500',
      trend: '+12.5%',
      trendUp: true,
    },
    {
      title: 'Transactions',
      value: stats?.totalTransactions || 0,
      icon: Receipt,
      bgColor: 'bg-blue-500',
      trend: '+8.2%',
      trendUp: true,
    },
    {
      title: 'Average Order',
      value: formatCurrency(stats?.averageOrderValue || 0),
      icon: TrendingUp,
      bgColor: 'bg-purple-500',
      trend: '+3.1%',
      trendUp: true,
    },
    {
      title: 'Products Sold',
      value: stats?.topProducts?.reduce((sum, p) => sum + p.totalSold, 0) || 0,
      icon: Package,
      bgColor: 'bg-orange-500',
      trend: '-2.4%',
      trendUp: false,
    },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back! 👋
        </h1>
        <p className="text-gray-600 mt-2">
          {tenant?.name || 'Your Business'} - Overview and statistics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {statCards.map((card, index) => (
          <div
            key={index}
            className="bg-white rounded-xl shadow-sm p-6 border border-gray-200 hover:shadow-md transition"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`${card.bgColor} p-3 rounded-lg`}>
                <card.icon className="w-6 h-6 text-white" />
              </div>
              <div className={`flex items-center space-x-1 text-sm ${
                card.trendUp ? 'text-green-600' : 'text-red-600'
              }`}>
                {card.trendUp ? (
                  <ArrowUpRight className="w-4 h-4" />
                ) : (
                  <ArrowDownRight className="w-4 h-4" />
                )}
                <span>{card.trend}</span>
              </div>
            </div>
            <p className="text-gray-600 text-sm mb-1">{card.title}</p>
            <p className="text-2xl font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>

      {/* Top Products */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-200">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Top Selling Products</h2>

        {stats?.topProducts && stats.topProducts.length > 0 ? (
          <div className="space-y-4">
            {stats.topProducts.slice(0, 5).map((item, index) => (
              <div
                key={item.product.id}
                className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
              >
                <div className="flex items-center space-x-4">
                  <div 
                    className="text-black font-bold w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{item.product.name}</p>
                    <p className="text-sm text-gray-600">{item.totalSold} sold</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{formatCurrency(item.revenue)}</p>
                  <p className="text-sm text-gray-600">Revenue</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No sales data available yet</p>
          </div>
        )}
      </div>
    </div>
  );
}
