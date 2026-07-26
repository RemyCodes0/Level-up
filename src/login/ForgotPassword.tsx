"use client";

import type React from "react";
import axios from "axios";
import { useState, useEffect } from "react";
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
import { motion } from "framer-motion";
import { Mail, ArrowRight, ArrowLeft } from "lucide-react";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:5000";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

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
    setLoading(true);
    try {
      await axios.post(`${BASE_URL}/api/auth/forgot-password`, { email });
    } catch {
      // Backend always returns a generic success message regardless of
      // whether the email exists — this catch only covers a genuine network
      // failure, not "email not found".
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

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
          {sent ? (
            <CardContent className="pt-10 pb-8 px-8 text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-5">
                <Mail className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Check your email</h2>
              <p className="text-sm text-slate-500 mb-1">If an account exists for</p>
              <p className="text-sm font-semibold text-slate-800 mb-6">{email}</p>
              <p className="text-xs text-slate-400 mb-6">
                we've sent a link to reset your password. It expires in 1 hour.
              </p>
              <div className="border-t border-slate-200 pt-5 mt-2">
                <a href="/login">
                  <Button className="w-full h-11 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 font-semibold">
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Back to login
                  </Button>
                </a>
              </div>
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
                      <Mail className="h-8 w-8 text-white" />
                    </div>
                  </div>
                </motion.div>
                <CardTitle className="text-2xl font-bold text-slate-900">Forgot your password?</CardTitle>
                <CardDescription className="text-base">
                  Enter your email and we'll send you a reset link.
                </CardDescription>
              </CardHeader>

              <form onSubmit={handleSubmit}>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-gray-700">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="your-email@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
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
                        <span>Sending...</span>
                      </div>
                    ) : (
                      <>
                        Send reset link
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
