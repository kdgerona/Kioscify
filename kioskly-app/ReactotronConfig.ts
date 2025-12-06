import Reactotron from 'reactotron-react-native';
import { Platform } from 'react-native';

// Only configure Reactotron in development
if (__DEV__) {
  // Automatically detect host
  const getReactotronHost = () => {
    // Use environment variable if set
    const envHost = process.env.EXPO_PUBLIC_REACTOTRON_HOST;
    if (envHost) {
      return envHost;
    }

    // For Android emulator, use special IP
    if (Platform.OS === 'android') {
      return '10.0.2.2';
    }

    // For iOS simulator and physical devices, use localhost
    // (works when Reactotron is running on the same machine as Metro)
    return 'localhost';
  };

  const host = getReactotronHost();

  try {
    Reactotron
      .configure({
        name: 'Kioskly',
        host,
      })
      .useReactNative({
        asyncStorage: true,
        networking: {
          ignoreUrls: /symbolicate|logs/,
        },
        editor: false,
        errors: { veto: () => false },
        overlay: false,
      })
      .connect();

    // Clear Reactotron on app start for a fresh session
    Reactotron.clear!();

    console.log(`✅ Reactotron Configured - Connecting to ${host}:9090`);
  } catch (error) {
    console.warn('⚠️ Reactotron failed to connect:', error);
  }
}

export default Reactotron;
