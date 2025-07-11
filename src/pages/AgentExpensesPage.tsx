import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { 
  DollarSign, 
  Save, 
  RotateCcw, 
  BarChart3,
  CheckCircle,
  User,
  Target
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';
import { toast } from 'react-hot-toast';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { v4 as uuidv4 } from 'uuid';
import confetti from 'canvas-confetti';

interface AgentExpenses {
  id?: string;
  agent_id: string;
  monthly_repayments: number;
  car_expenses: number;
  house_expenses: number;
  fees_other_kids: number;
  fuel_expenses: number;
  mobile_internet: number;
  other_expenses: number;
  created_at?: string;
  updated_at?: string;
}

interface BusinessPlan {
  id?: string;
  agent_id: string;
  period_type: 'daily' | 'weekly' | 'monthly' | 'yearly';
  working_days: number;
  settled_sales_target: number;
  avg_commission_per_sale: number;
}

export function AgentExpensesPage() {
  const { user } = useAuthStore();
  const [expenses, setExpenses] = useState<AgentExpenses>({
    agent_id: user?.id || uuidv4(),
    monthly_repayments: 0,
    car_expenses: 0,
    house_expenses: 0,
    fees_other_kids: 0,
    fuel_expenses: 0,
    mobile_internet: 0,
    other_expenses: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  const [businessPlan, setBusinessPlan] = useState<BusinessPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      console.warn('No user ID available, using fallback UUID for agent_id');
      toast.error('Please log in to load and save expenses');
      return;
    }
    fetchExpenses();
    fetchBusinessPlan();
  }, [user?.id]);

  const fetchExpenses = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('agent_expenses')
        .select('*')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data) {
        setExpenses(data);
      }
    } catch (error: any) {
      console.error('Error fetching expenses:', error);
      toast.error(`Failed to load expenses: ${error.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchBusinessPlan = async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('agent_business_plans')
        .select('id, agent_id, period_type, working_days, settled_sales_target, avg_commission_per_sale')
        .eq('agent_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        if (error.code === '42P01') {
          toast.error('Business plan table not found. Please create the table in Supabase.');
          return;
        }
        throw error;
      }

      if (data) {
        setBusinessPlan(data);
      } else {
        toast.warn('No business plan found. Please create one to see sales targets.');
      }
    } catch (error: any) {
      console.error('Error fetching business plan:', error);
      toast.error(`Failed to load business plan: ${error.message || 'Unknown error'}`);
    }
  };

  const validateExpenses = (expenses: AgentExpenses) => {
    if (calculateTotalExpenses() === 0) {
      return 'Please provide at least one expense field';
    }
    if (!expenses.agent_id) {
      return 'User ID is missing';
    }
    return null;
  };

  const saveExpenses = async () => {
    if (!user?.id) {
      toast.error('Please log in to save your expenses');
      return;
    }

    const validationError = validateExpenses(expenses);
    if (validationError) {
      toast.error(validationError);
      return;
    }

    setSaving(true);
    setSaveSuccess(false);
    try {
      console.log('Saving expenses with data:', {
        id: expenses.id || 'new UUID',
        agent_id: user.id,
        totalExpenses: calculateTotalExpenses(),
        expenses: { ...expenses }
      });

      const expensesData = {
        ...expenses,
        agent_id: user.id,
        updated_at: new Date().toISOString()
      };

      if (expenses.id) {
        console.log('Updating existing expenses with ID:', expenses.id);
        const { error } = await supabase
          .from('agent_expenses')
          .update(expensesData)
          .eq('id', expenses.id);
        if (error) {
          console.error('Update error details:', error);
          throw error;
        }
        toast.success('Expenses updated successfully!');
      } else {
        const newId = uuidv4();
        console.log('Creating new expenses with ID:', newId);
        const { data, error } = await supabase
          .from('agent_expenses')
          .insert([{ ...expensesData, id: newId, created_at: new Date().toISOString() }])
          .select()
          .single();
        if (error) {
          console.error('Insert error details:', error);
          throw error;
        }
        setExpenses(data);
        toast.success('Expenses created successfully!');
      }
      setSaveSuccess(true);
      setShowModal(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3B82F6', '#60A5FA', '#93C5FD']
      });
      setTimeout(() => {
        setSaveSuccess(false);
        setShowModal(false);
      }, 4000);
    } catch (error: any) {
      console.error('Error saving expenses:', error);
      let errorMessage = 'Failed to save expenses';
      if (error.code === '42P01') {
        errorMessage = 'Expenses table not found. Please create the table in Supabase.';
      } else if (error.code === '23502') {
        errorMessage = `Missing required field: ${error.details}`;
      } else if (error.code === '42501') {
        errorMessage = 'Permission denied: Please check your Supabase RLS policies';
      } else {
        errorMessage = error.message || 'Unknown error';
      }
      toast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const calculateTotalExpenses = () => {
    return (
      expenses.monthly_repayments +
      expenses.car_expenses +
      expenses.house_expenses +
      expenses.fees_other_kids +
      expenses.fuel_expenses +
      expenses.mobile_internet +
      expenses.other_expenses
    );
  };

  const calculateFinancialMetrics = () => {
    const totalExpenses = calculateTotalExpenses();
    let averageSalesRequired = 0;
    let salesPerMonth = 0;

    if (businessPlan && businessPlan.avg_commission_per_sale > 0) {
      averageSalesRequired = Math.ceil(totalExpenses / businessPlan.avg_commission_per_sale);
    }

    if (businessPlan) {
      const { period_type, working_days, settled_sales_target } = businessPlan;
      const multiplier = period_type === 'daily' ? 20 :
                       period_type === 'weekly' ? (working_days || 5) :
                       period_type === 'monthly' ? 1 :
                       (working_days || 240) / 12;
      salesPerMonth = Math.round(settled_sales_target * multiplier);
    }

    return {
      minimumCommissionRequired: totalExpenses,
      averageSalesRequired,
      salesPerMonth
    };
  };

  const financialMetrics = calculateFinancialMetrics();

  const expenseData = [
    { name: 'Repayments', value: expenses.monthly_repayments, fill: '#1E3A8A' },
    { name: 'Car', value: expenses.car_expenses, fill: '#3B82F6' },
    { name: 'House', value: expenses.house_expenses, fill: '#60A5FA' },
    { name: 'Kids Fees', value: expenses.fees_other_kids, fill: '#93C5FD' },
    { name: 'Fuel', value: expenses.fuel_expenses, fill: '#BFDBFE' },
    { name: 'Mobile/Internet', value: expenses.mobile_internet, fill: '#2563EB' },
    { name: 'Other', value: expenses.other_expenses, fill: '#1D4ED8' }
  ];

  const financialChartData = [
    { name: 'Total Expenses', value: financialMetrics.minimumCommissionRequired, fill: '#1E3A8A' },
    { name: 'Min Commission', value: financialMetrics.minimumCommissionRequired, fill: '#3B82F6' },
    { name: 'Avg Sales Required', value: financialMetrics.averageSalesRequired, fill: '#60A5FA' },
    { name: 'Sales/Month', value: financialMetrics.salesPerMonth, fill: '#93C5FD' }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-blue-900 flex items-center">
                <DollarSign className="w-8 h-8 mr-3 text-blue-600" />
                Agent Expenses
              </h1>
              <p className="text-blue-600 mt-2">
                Manage your monthly expenses and financial targets
              </p>
            </div>
            <div className="flex space-x-3">
              <Link
                to="/agent-profile"
                className="flex items-center px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors"
              >
                <User className="w-4 h-4 mr-2" />
                Back to Profile
              </Link>
              <button
                onClick={() => setExpenses({
                  ...expenses,
                  monthly_repayments: 0,
                  car_expenses: 0,
                  house_expenses: 0,
                  fees_other_kids: 0,
                  fuel_expenses: 0,
                  mobile_internet: 0,
                  other_expenses: 0
                })}
                className="flex items-center px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300 transition-colors"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </button>
              <button
                onClick={saveExpenses}
                disabled={saving || !user?.id}
                className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400 relative overflow-hidden"
              >
                <AnimatePresence>
                  {saving ? (
                    <motion.div
                      key="saving"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin"
                      />
                      Saving...
                    </motion.div>
                  ) : saveSuccess ? (
                    <motion.div
                      key="success"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="flex items-center"
                    >
                      <CheckCircle className="w-4 h-4 mr-2 text-green-300" />
                      Saved!
                    </motion.div>
                  ) : (
                    <motion.div
                      key="default"
                      initial={{ opacity: 1 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save Expenses
                    </motion.div>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>
        </motion.div>

        {/* Save Confirmation Modal */}
        <AnimatePresence>
          {showModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.8, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 50 }}
                className="bg-white rounded-lg p-6 max-w-lg w-full"
              >
                <h2 className="text-xl font-bold text-blue-900 mb-4">Expenses Saved Successfully!</h2>
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="text-blue-700 font-semibold">Expense</div>
                  <div className="text-blue-700 font-semibold">Amount</div>
                  {Object.entries(expenses).map(([key, value]) => {
                    if (key.includes('_expenses') || key === 'monthly_repayments') {
                      const label = key
                        .replace(/_/g, ' ')
                        .replace(/\b\w/g, char => char.toUpperCase());
                      return value > 0 && (
                        <React.Fragment key={key}>
                          <div>{label}</div>
                          <div>${Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                        </React.Fragment>
                      );
                    }
                    return null;
                  })}
                  <div className="font-semibold">Total</div>
                  <div className="font-semibold">${calculateTotalExpenses().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 bg-blue-200 text-blue-700 rounded-lg hover:bg-blue-300"
                  >
                    Close
                  </button>
                  <Link
                    to="/agent-expenses"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Edit Expenses
                  </Link>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expenses Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <DollarSign className="w-5 h-5 mr-2 text-blue-600" />
            Monthly Expenses
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              { label: 'Monthly Repayments', key: 'monthly_repayments' },
              { label: 'Car Expenses', key: 'car_expenses' },
              { label: 'House Expenses', key: 'house_expenses' },
              { label: 'Fees/Other Kids', key: 'fees_other_kids' },
              { label: 'Fuel Expenses', key: 'fuel_expenses' },
              { label: 'Mobile/Internet', key: 'mobile_internet' },
              { label: 'Other Expenses', key: 'other_expenses' }
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-sm font-semibold text-blue-700 mb-2">{field.label}</label>
                <input
                  type="number"
                  value={expenses[field.key as keyof AgentExpenses] as number}
                  onChange={(e) => setExpenses({ ...expenses, [field.key]: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-blue-300 rounded-lg bg-blue-50 text-blue-800"
                  placeholder="Enter amount"
                  min="0"
                  step="0.01"
                />
              </div>
            ))}
          </div>
        </motion.div>

        {/* Financial Targets Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <Target className="w-5 h-5 mr-2 text-blue-600" />
            Financial Targets to Cover Expenses
          </h2>
          {!businessPlan ? (
            <div className="text-blue-700">
              No business plan found. Please <Link to="/agent-business-plan" className="text-blue-600 underline hover:text-blue-800">create a business plan</Link> to see sales targets.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-blue-100 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    ${financialMetrics.minimumCommissionRequired.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-blue-600">Minimum Commission Required</div>
                </div>
                <div className="bg-blue-100 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {financialMetrics.averageSalesRequired.toLocaleString()}
                  </div>
                  <div className="text-sm text-blue-600">Average Sales Required</div>
                </div>
                <div className="bg-blue-100 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {financialMetrics.salesPerMonth.toLocaleString()}
                  </div>
                  <div className="text-sm text-blue-600">Sales Per Month (Target)</div>
                </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={financialChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#BFDBFE" />
                    <XAxis dataKey="name" stroke="#1E3A8A" />
                    <YAxis stroke="#1E3A8A" />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }}
                      formatter={(value: number, name: string) => [
                        name.includes('Sales') ? value.toLocaleString() : `$${value.toLocaleString()}`,
                        name
                      ]}
                    />
                    <Legend />
                    <Bar dataKey="value" name="Financial Metrics" fillOpacity={0.8}>
                      <LabelList 
                        dataKey="value" 
                        position="top" 
                        formatter={(value: number, entry: any) => 
                          entry?.name.includes('Sales') ? value.toLocaleString() : `$${value.toLocaleString()}`
                        } 
                        fill="#1E3A8A" 
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </motion.div>

        {/* Expense Distribution Chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg p-6 shadow-sm border border-blue-200 mb-8"
        >
          <h2 className="text-lg font-semibold mb-4 text-blue-900 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
            Expense Distribution
          </h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={expenseData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#BFDBFE" />
                <XAxis dataKey="name" stroke="#1E3A8A" />
                <YAxis stroke="#1E3A8A" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#EFF6FF', borderColor: '#3B82F6' }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, 'Amount']}
                />
                <Legend />
                <Bar dataKey="value" name="Expenses" fillOpacity={0.8}>
                  <LabelList dataKey="value" position="top" formatter={(value: number) => `$${value.toLocaleString()}`} fill="#1E3A8A" />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-blue-600 mt-4">
            Total Monthly Expenses: ${calculateTotalExpenses().toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default AgentExpensesPage;