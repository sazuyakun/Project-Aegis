import React, { useState, useEffect, useCallback } from "react";
import { useStateContext } from "../BlockchainContext";
import { LiquidityPoolData } from "../types";
import {
  User,
  Wallet,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Gift,
  Plus,
  Minus,
  RefreshCw,
  ArrowUpRight,
  PieChart,
  Activity,
  Clock,
  Coins,
  Shield,
  Target,
  Briefcase, // Added for Bank Activity
} from "lucide-react";

// --- New Interfaces for Bank Activity ---
interface BankActivityHour {
  hour: number;
  isActive: boolean;
}

interface BankActivityScheduleResponse {
  schedule: BankActivityHour[];
  lastUpdated: string;
}

interface ProfileStats {
  totalCollateral: number;
  totalDebt: number;
  totalStaked: number;
  totalRewards: number;
  netWorth: number;
  activePools: number;
}

interface PoolParticipation {
  poolId: string;
  regionName: string;
  stakedAmount: number;
  collateralAmount: number;
  debtAmount: number;
  lpTokens: number;
  apy: number;
}

interface User {
  id: string;
}

interface ProfileProps {
  pools: LiquidityPoolData[];
}

interface DistributedStakeResponse {
  total_amount_distributed: number;
  successful_stakes: Array<{
    poolId: string;
    amount: number;
    transaction_hash: string;
    status: string;
  }>;
  failed_stakes: Array<{
    poolId: string;
    amount: number;
    error: string;
  }>;
  distribution_strategy: string;
  status: string;
}

const Profile: React.FC<ProfileProps> = ({ pools }) => {
  const {
    address,
    unstakeFromPool,
    repayOnChain,
    addAppNotification,
    isLoading,
  } = useStateContext();

  const [profileStats, setProfileStats] = useState<ProfileStats>({
    totalCollateral: 0,
    totalDebt: 0,
    totalStaked: 0,
    totalRewards: 0,
    netWorth: 0,
    activePools: 0,
  });

  const [poolParticipations, setPoolParticipations] = useState<
    PoolParticipation[]
  >([]);
  const [selectedAction, setSelectedAction] = useState<
    "stake" | "unstake" | null
  >(null);
  const [actionAmount, setActionAmount] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isDistributedStaking, setIsDistributedStaking] = useState(false);
  const [hasShownRepaymentToast, setHasShownRepaymentToast] = useState(false);

  // --- State for Bank Activity ---
  const [bankActivitySchedule, setBankActivitySchedule] = useState<
    BankActivityHour[]
  >([]);
  const [isBankActivityLoading, setIsBankActivityLoading] = useState(true);
  const [bankActivityError, setBankActivityError] = useState<string | null>(
    null
  );

  // --- Fetch Bank Activity Data ---
  useEffect(() => {
    const fetchBankActivity = async () => {
      setIsBankActivityLoading(true);
      setBankActivityError(null);
      try {
        // Default to localhost:8001 if env var not set (Agent 1's default port)
        const agent1ApiUrl =
          process.env.REACT_APP_AGENT1_API_URL || "http://localhost:8001";
        const response = await fetch(`${agent1ApiUrl}/bank-activity-schedule`);
        if (!response.ok) {
          const errorData = await response.text();
          throw new Error(
            `Failed to fetch bank activity: ${response.status} ${
              errorData || response.statusText
            }`
          );
        }
        const data: BankActivityScheduleResponse = await response.json();
        setBankActivitySchedule(data.schedule);
      } catch (error) {
        console.error("Error fetching bank activity:", error);
        setBankActivityError(
          error instanceof Error
            ? error.message
            : "Unknown error fetching bank activity"
        );
        setBankActivitySchedule([]); // Clear schedule on error
      } finally {
        setIsBankActivityLoading(false);
      }
    };

    fetchBankActivity();
    // Re-fetch bank activity periodically (e.g., every 5 minutes) or allow manual refresh
    const intervalId = setInterval(fetchBankActivity, 5 * 60 * 1000); // every 5 minutes
    return () => clearInterval(intervalId);
  }, []);

  // Distributed staking API call
  const stakeInPoolDistributed = async (amount: string): Promise<boolean> => {
    try {
      setIsDistributedStaking(true);

      // You may need to adjust this URL based on your API server configuration
      // Common patterns: 'http://localhost:8000/stakeInPoolDistributed' or '/api/stakeInPoolDistributed'
      const apiUrl = process.env.REACT_APP_API_URL || "http://localhost:8000";

      console.log("Making API call to:", `${apiUrl}/stakeInPoolDistributed`);
      const response = await fetch(`${apiUrl}/stakeInPoolDistributed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: amount,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Distributed staking failed";

        // Check if response has content before trying to parse JSON
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.detail || errorMessage;
          } catch (jsonError) {
            // If JSON parsing fails, use status text
            errorMessage = `HTTP ${response.status}: ${response.statusText}`;
          }
        } else {
          errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        }

        throw new Error(errorMessage);
      }

      // Check if response has content before parsing JSON
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Expected JSON response from server");
      }

      const result: DistributedStakeResponse = await response.json();

      if (result.status === "success") {
        addAppNotification(
          `Successfully distributed ${result.total_amount_distributed} tokens across ${result.successful_stakes.length} pools`,
          "success"
        );
        return true;
      } else if (result.status === "partial_success") {
        addAppNotification(
          `Partially successful: ${result.successful_stakes.length} stakes succeeded, ${result.failed_stakes.length} failed`,
          "warning"
        );

        // Show details of failed stakes
        result.failed_stakes.forEach((failure) => {
          addAppNotification(
            `Failed to stake ${failure.amount} in pool ${failure.poolId}: ${failure.error}`,
            "error"
          );
        });

        return result.successful_stakes.length > 0;
      } else {
        throw new Error("All stakes failed");
      }
    } catch (error) {
      console.error("Distributed staking error:", error);
      addAppNotification(
        `Distributed staking failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
        "error"
      );
      return false;
    } finally {
      setIsDistributedStaking(false);
    }
  };

  const loadProfileData = useCallback(async () => {
    if (!address || !pools) return;

    try {
      setIsRefreshing(true);

      // Create user object for the stats calculation
      const user: User = { id: address };

      // Calculate user stats using the provided logic
      const userStats = pools.reduce(
        (acc, pool) => {
          const userStake = pool.stakers.find((s) => s.userId === user.id);
          if (userStake) {
            acc.totalStaked += userStake.stakedAmount;
            acc.totalCollateral += userStake.collateralAmount;
            acc.activePools += 1;
          }
          acc.totalDebt += pool.userDebt;
          return acc;
        },
        {
          totalStaked: 0,
          totalCollateral: 0,
          totalDebt: 0,
          activePools: 0,
        }
      );

      // Calculate rewards and participations
      let totalRewards = 0;
      const participations: PoolParticipation[] = [];

      pools.forEach((pool) => {
        const userStake = pool.stakers.find((s) => s.userId === address);
        const userDebt = pool.debts
          .filter((debt) => debt.userId === address && !debt.isRepaid)
          .reduce((sum, debt) => sum + debt.amount, 0);

        if (userStake || userDebt > 0) {
          const stakedAmount = userStake?.stakedAmount || 0;
          const collateralAmount = userStake?.collateralAmount || 0;
          const lpTokens = userStake?.lpTokensMinted || 0;

          totalRewards += (stakedAmount * pool.apy) / 100; // Simplified reward calculation

          participations.push({
            poolId: pool.id,
            regionName: pool.regionName,
            stakedAmount,
            collateralAmount,
            debtAmount: userDebt,
            lpTokens,
            apy: pool.apy,
          });
        }
      });

      // Net worth is the sum of all staked amounts (as per your requirement)
      const netWorth = userStats.totalStaked;

      setProfileStats({
        totalCollateral: userStats.totalCollateral,
        totalDebt: userStats.totalDebt,
        totalStaked: userStats.totalStaked,
        totalRewards,
        netWorth,
        activePools: userStats.activePools,
      });

      setPoolParticipations(participations);
    } catch (error) {
      console.error("Error loading profile data:", error);
      addAppNotification("Failed to load profile data", "error");
    } finally {
      setIsRefreshing(false);
    }
  }, [address, pools, addAppNotification]);

  useEffect(() => {
    loadProfileData();
  }, [loadProfileData]);

  // Effect for polling repayment status

  useEffect(() => {
    if (!address) return;

    const AGENT2_API_URL =
      process.env.REACT_APP_AGENT2_API_URL || "http://localhost:8000"; // Ensure this env var is set or default is correct

    const checkRepaymentStatus = async () => {
      try {
        const response = await fetch(
          `${AGENT2_API_URL}/repayment-status/${address}`
        );
        if (!response.ok) {
          // Don't show error toast for routine polling checks unless it's a persistent issue
          console.warn(`Repayment status check failed: ${response.status}`);
          return;
        }
        const data = await response.json();
        if (data.status === "active" && !hasShownRepaymentToast) {
          addAppNotification(
            "A linked bank account has become active. Debt repayment process has begun.",
            "info",
            5000 // Show for 5 seconds
          );
          setHasShownRepaymentToast(true);
        } else if (data.status === "idle" && hasShownRepaymentToast) {
          // Reset the flag if the backend status is no longer active
          setHasShownRepaymentToast(false);
        }
      } catch (error) {
        console.error("Error polling repayment status:", error);
        // Avoid spamming notifications for network errors during polling
      }
    };

    // Poll every 10 seconds
    const intervalId = setInterval(checkRepaymentStatus, 10000);

    // Initial check
    checkRepaymentStatus();

    // Cleanup interval on component unmount
    return () => clearInterval(intervalId);
  }, [address, addAppNotification, hasShownRepaymentToast]);

  const handleStakeUnstake = async () => {
    if (!actionAmount) {
      addAppNotification("Please enter an amount", "error");
      return;
    }

    const amount = parseFloat(actionAmount);
    if (isNaN(amount) || amount <= 0) {
      addAppNotification("Please enter a valid amount", "error");
      return;
    }

    try {
      let success = false;
      if (selectedAction === "stake") {
        // Use distributed staking - no pool selection needed
        success = await stakeInPoolDistributed(amount.toString());
      } else {
        // Unstaking still requires specific pool selection
        success = await unstakeFromPool(amount.toString());
      }

      if (success) {
        setActionAmount("");
        setSelectedAction(null);
        await loadProfileData();
      }
    } catch (error) {
      console.error("Stake/Unstake error:", error);
    }
  };

  const handleRepayAllDebt = async () => {
    try {
      const success = await repayOnChain();
      if (success) {
        await loadProfileData();
      }
    } catch (error) {
      console.error("Repay debt error:", error);
    }
  };

  const handleClaimRewards = async () => {
    // This would integrate with a reward claiming function
    addAppNotification("Reward claiming functionality coming soon!", "info");
  };

  if (!address) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Wallet className="mx-auto h-16 w-16 text-slate-500 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">
            Connect Your Wallet
          </h2>
          <p className="text-slate-400">
            Please connect your wallet to view your profile
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-700 rounded-full flex items-center justify-center">
              <User className="w-6 h-6 text-slate-300" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">
                Portfolio Overview
              </h1>
              <p className="text-slate-400 text-sm">
                {address.substring(0, 6)}...
                {address.substring(address.length - 4)}
              </p>
            </div>
          </div>
          <button
            onClick={loadProfileData}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-800 rounded-lg text-white text-sm transition-colors"
          >
            <RefreshCw
              className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-slate-400" />
              <h3 className="text-slate-300 text-sm font-medium">Net Worth</h3>
            </div>
            <p className="text-xl font-bold text-white">
              ${profileStats.netWorth.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Total staked amount</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Shield className="w-4 h-4 text-slate-400" />
              <h3 className="text-slate-300 text-sm font-medium">
                Total Collateral
              </h3>
            </div>
            <p className="text-xl font-bold text-white">
              ${profileStats.totalCollateral.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              Available for borrowing
            </p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
              <h3 className="text-slate-300 text-sm font-medium">Total Debt</h3>
            </div>
            <p className="text-xl font-bold text-white">
              ${profileStats.totalDebt.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Outstanding balance</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4 text-slate-400" />
              <h3 className="text-slate-300 text-sm font-medium">
                Total Staked
              </h3>
            </div>
            <p className="text-xl font-bold text-white">
              ${profileStats.totalStaked.toFixed(2)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Across all pools</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-slate-400" />
              <h3 className="text-slate-300 text-sm font-medium">
                Active Pools
              </h3>
            </div>
            <p className="text-xl font-bold text-white">
              {profileStats.activePools}
            </p>
            <p className="text-xs text-slate-500 mt-1">Participating pools</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            Quick Actions
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
            <button
              onClick={() => setSelectedAction("stake")}
              className="flex items-center gap-2 p-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white text-sm transition-colors"
            >
              <Plus className="w-4 h-4" />
              Stake Tokens (Distributed)
            </button>

            <button
              onClick={() => setSelectedAction("unstake")}
              className="flex items-center gap-2 p-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white text-sm transition-colors"
            >
              <Minus className="w-4 h-4" />
              Unstake Tokens
            </button>

            <button
              onClick={handleRepayAllDebt}
              disabled={profileStats.totalDebt === 0 || isLoading}
              className="flex items-center gap-2 p-3 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DollarSign className="w-4 h-4" />
              Repay All Debt
            </button>
          </div>

          {/* Action Form */}
          {selectedAction && (
            <div className="bg-slate-700 rounded-lg p-4 border border-slate-600">
              <h3 className="text-base font-semibold text-white mb-4 capitalize">
                {selectedAction} Tokens
                {selectedAction === "stake" && (
                  <span className="text-sm font-normal text-slate-400 ml-2">
                    (Auto-distributed across pools)
                  </span>
                )}
              </h3>

              <div className="space-y-4">
                {/* Amount input */}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Amount
                  </label>
                  <input
                    type="number"
                    value={actionAmount}
                    onChange={(e) => setActionAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full p-2 bg-slate-800 border border-slate-600 rounded text-white text-sm focus:ring-1 focus:ring-slate-500 focus:border-slate-500"
                  />
                  {selectedAction === "stake" && (
                    <p className="text-xs text-slate-500 mt-1">
                      Amount will be automatically distributed across active
                      pools using inverse liquidity strategy
                    </p>
                  )}
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleStakeUnstake}
                    disabled={
                      !actionAmount || isLoading || isDistributedStaking
                    }
                    className="flex-1 px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 rounded text-white text-sm font-medium transition-colors disabled:cursor-not-allowed"
                  >
                    {isLoading || isDistributedStaking
                      ? "Processing..."
                      : `${
                          selectedAction === "stake"
                            ? "Distribute & Stake"
                            : "Unstake"
                        }`}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedAction(null);
                      setActionAmount("");
                    }}
                    className="px-4 py-2 bg-slate-700 hover:bg-slate-600 rounded text-white text-sm font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bank Activity Insights */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Briefcase className="w-5 h-5 text-slate-400" />
            Bank Operational Hours (Today)
          </h2>
          {isBankActivityLoading ? (
            <div className="flex items-center justify-center h-32">
              <RefreshCw className="w-6 h-6 text-slate-500 animate-spin mr-2" />
              <p className="text-slate-400">Loading bank activity...</p>
            </div>
          ) : bankActivityError ? (
            <div className="flex items-center justify-center h-32">
              <AlertTriangle className="w-6 h-6 text-red-500 mr-2" />
              <p className="text-red-400">Error: {bankActivityError}</p>
            </div>
          ) : bankActivitySchedule.length > 0 ? (
            <div className="flex space-x-1 h-24 items-end">
              {bankActivitySchedule.map((activity) => (
                <div
                  key={activity.hour}
                  className="relative flex-1 group"
                  title={`${activity.hour}:00 - ${activity.hour + 1}:00: ${
                    activity.isActive ? "Active" : "Inactive"
                  }`}
                >
                  <div
                    className={`w-full rounded-t-sm transition-all duration-300 ease-in-out ${
                      activity.isActive ? "bg-green-500" : "bg-slate-600"
                    }`}
                    style={{
                      height: activity.isActive
                        ? `${((activity.hour % 12) + 1) * 6 + 30}%`
                        : "30%", // Just for varied heights, not meaningful
                      minHeight: "10px", // Ensure a minimum visible height
                    }}
                  />
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                    {activity.hour % 12 === 0 ? 12 : activity.hour % 12}
                    {activity.hour < 12 || activity.hour === 23 ? "a" : "p"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-400 text-center">
              No bank activity data available.
            </p>
          )}
          <p className="text-xs text-slate-500 mt-3 text-center">
            Visual representation of typical bank operational status throughout
            the day. Fetched from Agent 1.
          </p>
        </div>

        {/* Pool Participations */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5" />
            Pool Participations
          </h2>

          {poolParticipations.length === 0 ? (
            <div className="text-center py-8">
              <Coins className="mx-auto h-12 w-12 text-slate-600 mb-4" />
              <p className="text-slate-400">No pool participations found</p>
              <p className="text-slate-500 text-sm">
                Start by staking tokens in a liquidity pool
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {poolParticipations.map((pool) => (
                <div
                  key={pool.poolId}
                  className="bg-slate-700 border border-slate-600 rounded-lg p-4 hover:bg-slate-650 transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-base font-semibold text-white">
                      {pool.regionName}
                    </h3>
                    <span className="text-xs bg-slate-600 text-slate-300 px-2 py-1 rounded">
                      {pool.apy.toFixed(1)}% APY
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">
                        Staked Amount:
                      </span>
                      <span className="text-white text-sm font-medium">
                        ${pool.stakedAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">
                        Collateral Value:
                      </span>
                      <span className="text-green-400 text-sm font-medium">
                        ${pool.collateralAmount.toFixed(2)}
                      </span>
                    </div>

                    {pool.debtAmount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 text-sm">
                          Outstanding Debt:
                        </span>
                        <span className="text-red-400 text-sm font-medium">
                          ${pool.debtAmount.toFixed(2)}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-slate-400 text-sm">LP Tokens:</span>
                      <span className="text-slate-300 text-sm font-medium">
                        {pool.lpTokens.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Rewards Section */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Gift className="w-5 h-5" />
              Rewards & Earnings
            </h2>
            <button
              onClick={handleClaimRewards}
              disabled={profileStats.totalRewards === 0}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-800 rounded text-white text-sm transition-colors disabled:cursor-not-allowed"
            >
              Claim Rewards
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Gift className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 text-sm font-medium">
                  Pending Rewards
                </span>
              </div>
              <p className="text-xl font-bold text-white">
                ${profileStats.totalRewards.toFixed(2)}
              </p>
            </div>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ArrowUpRight className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 text-sm font-medium">
                  Total Earned
                </span>
              </div>
              <p className="text-xl font-bold text-white">$0.00</p>
            </div>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300 text-sm font-medium">
                  Next Reward
                </span>
              </div>
              <p className="text-xl font-bold text-white">24h</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
