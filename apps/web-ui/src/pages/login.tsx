import { useState } from "react";
import { useRouter } from "next/router";
import { FaUser, FaLock, FaExclamationCircle, FaWindows, FaGoogle } from 'react-icons/fa';
import Image from "next/image";
import { useTranslation } from 'react-i18next';
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "@/components/Icon";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useTranslation();
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await login(username, password);
    } catch (err: any) {
      setError(err?.message || t('login.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-lg">
        <div className="text-center">
          <Image
            src="https://img2.pic.in.th/pic/logo14821dedd19c2ad18.png"
            alt="FG Label Logo"
            width={128}
            height={128}
            unoptimized
            className="mx-auto h-32 w-auto mb-6"
            priority
            style={{ width: 'auto', height: 'auto' }}
          />
          <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
            {t('login.title')}
          </h2>
          <p className="text-gray-600 text-sm">
            FG Label Management System
          </p>
        </div>
        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div className="relative">
              <Icon icon={FaUser} />
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.username')}
              </label>
              <div className="relative rounded-md shadow-sm">
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder={t('Username')}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
            </div>
            <div className="relative">
              <Icon icon={FaLock} />
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                {t('login.password')}
              </label>
              <div className="relative rounded-md shadow-sm">
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none block w-full pl-10 px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  placeholder={t('Password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
          </div>

          {error && (
            <div className="flex items-center text-red-500 text-sm">
              <Icon icon={FaExclamationCircle} size={16} />
              <span className="ml-2">{error}</span>
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <div className="flex items-center">
                  <LoadingSpinner size="small" color="white" />
                  <span className="ml-2">{t('login.loading')}</span>
                </div>
              ) : (
                <div className="flex items-center">
                  <Icon icon={FaWindows} />
                  <span>{t('login.submit')}</span>
                </div>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
} 