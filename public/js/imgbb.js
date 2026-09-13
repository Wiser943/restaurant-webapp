// Tiny helper for uploading an image straight from the browser to ImgBB
// (https://api.imgbb.com), so we never have to store/host screenshots
// ourselves — we just save the resulting URL on the order.
//
// IMPORTANT (setup step): get a free API key at https://api.imgbb.com/
// and paste it below. Until it's set, uploads are skipped gracefully and
// the customer can still submit the order without a screenshot (proof is
// optional per spec) — they'll just see a note that upload isn't configured.
const IMGBB_API_KEY = '0251ff89aa26f5ade333ed4e51cdc2e1';

const Imgbb = {
  isConfigured() {
    return Boolean(IMGBB_API_KEY) && IMGBB_API_KEY !== 'PASTE_YOUR_IMGBB_API_KEY_HERE';
  },

  /**
   * @param {File} file
   * @returns {Promise<string>} the hosted image URL
   */
  async upload(file) {
    if (!this.isConfigured()) {
      throw new Error('Screenshot upload isn\'t set up yet — you can still submit without one.');
    }
    if (!file.type.startsWith('image/')) {
      throw new Error('Please choose an image file.');
    }
    if (file.size > 10 * 1024 * 1024) {
      throw new Error('That image is too large (max 10MB).');
    }

    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]);
      reader.onerror = () => reject(new Error('Could not read that file.'));
      reader.readAsDataURL(file);
    });

    const form = new FormData();
    form.append('image', base64);

    const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
      method: 'POST',
      body: form,
    });
    const data = await res.json();
    if (!res.ok || !data?.data?.url) {
      throw new Error(data?.error?.message || 'Upload failed. Please try again.');
    }
    return data.data.url;
  },
};
