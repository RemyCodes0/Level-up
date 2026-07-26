"use client";

import type React from "react";
import axios from "axios";
import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { motion } from "framer-motion";
import { Lock, ArrowRight, ArrowLeft, AlertCircle, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { isPasswordAcceptable } from "../lib/passwordStrength";
import { PasswordStrengthMeter } from "../components/PasswordStrengthMeter";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.background =
      "linear-gradient(135deg, #eff6ff 0%, #f5f3ff 50%, #fdf2f8 100%)";
    document.body.style.minHeight = "100dvh";
    return () => {
      document.body.style.background = "";
      document.body.style.minHeight = "";
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!isPasswordAcceptable(password)) {
      setError("Please choose a stronger password before continuing.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/auth/reset-password`, { token, password });
      setDone(true);
    } catch (err: any) {
      setError(err.response?.data?.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // No token in the URL at all — a malformed or truncated link, not a
  // server-verified "expired" case (that comes back from the API instead).
  if (!token) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-4">
        <Card className="border-0 shadow-2xl backdrop-blur-sm bg-white/95 max-w-sm w-full">
          <CardContent className="pt-10 pb-8 px-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Invalid reset link</h2>
            <p className="text-sm text-slate-500 mb-6">This link is missing its token. Please request a new one.</p>
            <a href="/forgot-password">
              <Button className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold">
                Request a new link
              </Button>
            </a>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-blue-400/20 rounded-full blur-3xl animate-pulse" />
        <div
          className="absolute bottom-0 right-0 w-2/3 h-2/3 bg-purple-400/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <Card className="border-0 shadow-2xl backdrop-blur-sm bg-white/95">
          {done ? (
            <CardContent className="pt-10 pb-8 px-8 text-center">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <CheckCircle className="h-8 w-8 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Password reset!</h2>
              <p className="text-sm text-slate-500 mb-6">You can now log in with your new password.</p>
              <Button
                onClick={() => navigate("/login")}
                className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold"
              >
                Go to login
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </CardContent>
          ) : (
            <>
              <CardHeader className="space-y-3 text-center pb-6">
                <motion.div
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="flex justify-center mb-2"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full blur-lg opacity-50 animate-pulse" />
                    <div className="relative bg-gradient-to-r from-blue-600 to-purple-600 p-4 rounded-full shadow-lg">
                      <Lock className="h-8 w-8 text-white" />
                    </div>
                  </div>
                </motion.div>
                <CardTitle className="text-2xl font-bold text-slate-900">Choose a new password</CardTitle>
                <CardDescription className="text-base">Make it one you haven't used before.</CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-5">
                  {error && (
                    <Alert variant="destructive" className="border-red-200 bg-red-50">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="text-sm">{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="password" className="text-sm font-semibold text-gray-700">
                      New Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder="Create a strong password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10 pr-10 h-12 border-2 border-gray-200 focus:border-blue-500 transition-colors"
                        required
                        minLength={8}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                    <PasswordStrengthMeter password={password} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword" className="text-sm font-semibold text-gray-700">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="confirmPassword"
                        type={showPassword ? "text" : "password"}
                        placeholder="Re-enter your password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10 h-12 border-2 border-gray-200 focus:border-blue-500 transition-colors"
                        required
                      />
                    </div>
                  </div>
                </CardContent>

                <CardFooter className="flex flex-col space-y-4 pt-2">
                  <Button
                    type="submit"
                    className="w-full h-12 text-base font-semibold bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all group"
                    disabled={loading}
                  >
                    {loading ? (
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Resetting...</span>
                      </div>
                    ) : (
                      <>
                        Reset password
                        <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </Button>

                  <a href="/login" className="text-sm text-blue-600 hover:text-blue-700 font-medium hover:underline flex items-center gap-1.5">
                    <ArrowLeft className="h-3.5 w-3.5" /> Back to login
                  </a>
                </CardFooter>
              </form>
            </>
          )}
        </Card>
      </motion.div>
    </div>
  );
}
