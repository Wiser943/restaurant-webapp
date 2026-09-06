// Wraps the browser's Geolocation API in a Promise, with the accuracy/
// timeout settings tuned for "customer standing at checkout wants their
// exact spot", not a background location watch.
const Geo = {
  /**
   * @returns {Promise<{ lat: number, lng: number, accuracy: number }>}
   * Rejects with a short, user-facing message on any failure (permission
   * denied, timeout, unsupported browser) — callers can show err.message
   * directly in the UI.
   */
  getCustomerLocation() {
    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        return reject(new Error('Your browser does not support location access. Please enter your address manually.'));
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });
        },
        (err) => {
          let message = 'Could not get your location. Please enable location access and try again.';
          if (err.code === err.PERMISSION_DENIED) {
            message = 'Location access was denied. Please allow location access to calculate your delivery fee.';
          } else if (err.code === err.TIMEOUT) {
            message = 'Getting your location took too long. Please try again.';
          }
          reject(new Error(message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0, // always ask fresh at checkout, never reuse a stale cached fix
        }
      );
    });
  },
};
