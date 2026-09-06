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
    // Not secure-context (plain http, not localhost) is a common silent
    // failure: the browser just rejects immediately with a generic error.
    // Catch it up front so the message actually explains what's wrong.
    if (window.isSecureContext === false) {
      return Promise.reject(new Error('Location access needs a secure (https) connection. Please enter your address manually.'));
    }

    return new Promise((resolve, reject) => {
      if (!('geolocation' in navigator)) {
        return reject(new Error('Your browser does not support location access. Please enter your address manually.'));
      }

      const fail = (err) => {
        let message = 'Could not get your location. Please enable location access and try again.';
        if (err.code === err.PERMISSION_DENIED) {
          message = 'Location access was denied. Please allow location access in your browser settings, then try again.';
        } else if (err.code === err.TIMEOUT) {
          message = 'Getting your location took too long. Please check your GPS/network and try again.';
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          message = 'Your location is currently unavailable. Please try again, or enter your address manually.';
        }
        reject(new Error(message));
      };

      const succeed = (position) => resolve({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
      });

      // First try for a precise GPS fix. If that specifically times out,
      // fall back once to a coarser, network-based fix with a longer
      // timeout rather than failing outright — a lot of "it just errors"
      // reports are really just a high-accuracy timeout indoors.
      navigator.geolocation.getCurrentPosition(
        succeed,
        (err) => {
          if (err.code === err.TIMEOUT) {
            navigator.geolocation.getCurrentPosition(succeed, fail, {
              enableHighAccuracy: false,
              timeout: 15000,
              maximumAge: 60000,
            });
          } else {
            fail(err);
          }
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
