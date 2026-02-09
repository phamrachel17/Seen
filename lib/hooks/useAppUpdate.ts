import { useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../supabase';
import { isVersionLessThan } from '../version';

const DISMISSED_VERSION_KEY = '@seen/dismissed_update_version';

// Get version from app.json (works in dev) or native version (works in production)
function getAppVersion(): string | null {
  // In development, use the version from app.json via Constants
  const manifestVersion = Constants.expoConfig?.version;
  if (manifestVersion) {
    return manifestVersion;
  }
  // In production builds, use the native version
  return Application.nativeApplicationVersion;
}

interface AppConfig {
  latest_version: string;
  min_version: string | null;
  ios_store_url: string | null;
  android_store_url: string | null;
  update_message: string | null;
}

interface UseAppUpdateResult {
  showUpdatePrompt: boolean;
  isForceUpdate: boolean;
  latestVersion: string | null;
  storeUrl: string | null;
  updateMessage: string | null;
  dismissUpdate: () => Promise<void>;
}

export function useAppUpdate(): UseAppUpdateResult {
  const [showUpdatePrompt, setShowUpdatePrompt] = useState(false);
  const [isForceUpdate, setIsForceUpdate] = useState(false);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);
  const [updateMessage, setUpdateMessage] = useState<string | null>(null);

  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    try {
      const currentVersion = getAppVersion();
      if (!currentVersion) return;

      const { data, error } = await supabase
        .from('app_config')
        .select('*')
        .single();

      if (error || !data) return;

      const config = data as AppConfig;
      setLatestVersion(config.latest_version);
      setUpdateMessage(config.update_message);

      const url = Platform.OS === 'ios'
        ? config.ios_store_url
        : config.android_store_url;
      setStoreUrl(url);

      // Force update if below min_version
      if (config.min_version && isVersionLessThan(currentVersion, config.min_version)) {
        setIsForceUpdate(true);
        setShowUpdatePrompt(true);
        return;
      }

      // Optional update check
      if (isVersionLessThan(currentVersion, config.latest_version)) {
        const dismissed = await AsyncStorage.getItem(DISMISSED_VERSION_KEY);
        if (dismissed !== config.latest_version) {
          setShowUpdatePrompt(true);
        }
      }
    } catch (error) {
      console.warn('Failed to check for app update:', error);
    }
  };

  const dismissUpdate = useCallback(async () => {
    if (latestVersion && !isForceUpdate) {
      await AsyncStorage.setItem(DISMISSED_VERSION_KEY, latestVersion);
    }
    setShowUpdatePrompt(false);
  }, [latestVersion, isForceUpdate]);

  return {
    showUpdatePrompt,
    isForceUpdate,
    latestVersion,
    storeUrl,
    updateMessage,
    dismissUpdate,
  };
}
