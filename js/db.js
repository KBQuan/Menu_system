// VegeBento Go! Database Service Wrapper

let supabaseClient = null;
let isSupabaseActive = false;

// 初始化 Supabase
function initSupabase() {
  if (typeof window.supabase !== 'undefined' && SUPABASE_CONFIG && SUPABASE_CONFIG.URL && SUPABASE_CONFIG.URL.trim() !== '' && SUPABASE_CONFIG.KEY && SUPABASE_CONFIG.KEY.trim() !== '') {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.KEY);
      isSupabaseActive = true;
      console.log('VegeBento DB: Connected to Supabase Cloud Database successfully!');
    } catch (err) {
      console.warn('VegeBento DB: Supabase initialization error, falling back to LocalStorage.', err);
      isSupabaseActive = false;
    }
  } else {
    console.log('VegeBento DB: Supabase URL/Key is not fully configured. Running in LocalStorage mode.');
    isSupabaseActive = false;
  }
}

// 在網頁加載時即刻初始化
initSupabase();

const VegeBentoDB = {
  localDateString(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  firstSelectableDate(now = new Date()) {
    const cutoff = new Date(now);
    cutoff.setHours(13, 30, 0, 0);
    const date = new Date(now);
    if (now >= cutoff) {
      date.setDate(date.getDate() + 1);
    }
    return this.localDateString(date);
  },

  nextBusinessDates(count = 6, startDate = this.firstSelectableDate()) {
    const dates = [];
    const date = new Date(`${startDate}T00:00:00`);
    while (dates.length < count) {
      const day = date.getDay();
      if (day !== 0 && day !== 6) {
        dates.push(this.localDateString(date));
      }
      date.setDate(date.getDate() + 1);
    }
    return dates;
  },

  refreshPlannedMenusWindow(plans, count = 6) {
    const source = Array.isArray(plans) ? plans : [];
    const firstDate = this.firstSelectableDate();
    const byDate = new Map();

    source.forEach(plan => {
      if (!plan || !plan.date || plan.date < firstDate) return;
      byDate.set(plan.date, {
        date: plan.date,
        dishIds: Array.isArray(plan.dishIds) ? plan.dishIds : [],
        priceOverrides: plan.priceOverrides || {}
      });
    });

    this.nextBusinessDates(count, firstDate).forEach(date => {
      if (!byDate.has(date)) {
        byDate.set(date, { date, dishIds: [], priceOverrides: {} });
      }
    });

    const refreshed = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    const changed = JSON.stringify(source) !== JSON.stringify(refreshed);
    return { plans: refreshed, changed };
  },

  getLocalOrders() {
    const stored = localStorage.getItem('vege_bento_orders');
    return stored ? JSON.parse(stored) : [];
  },

  mergeOrders(cloudOrders, localOrders) {
    const orderMap = new Map();
    [...localOrders, ...cloudOrders].forEach(order => {
      if (order && order.id) orderMap.set(order.id, order);
    });
    return Array.from(orderMap.values()).sort((a, b) => {
      const aTime = Date.parse(a.createdAt || '') || 0;
      const bTime = Date.parse(b.createdAt || '') || 0;
      if (aTime || bTime) return bTime - aTime;
      return String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
    });
  },

  // === 1. 主菜管理 (Main Dishes) ===
  async getDishes() {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_main_dishes')
          .select('*')
          .order('id', { ascending: true });
        if (!error && data) {
          // 將資料庫的蛇形命名法對應回前端程式預期的駝峰命名法
          return data.map(dish => ({
            id: dish.id,
            name: dish.name,
            vegType: dish.veg_type || '全素',
            priceType: dish.price_type || 'all',
            specificPrice: dish.specific_price || '',
            available: dish.available !== undefined ? dish.available : true
          }));
        }
        console.error('Supabase getDishes error:', error);
      } catch (err) {
        console.error('Supabase getDishes exception:', err);
      }
    }
    
    // 降級 LocalStorage 模式
    const stored = localStorage.getItem('vege_bento_main_dishes');
    return stored ? JSON.parse(stored) : [];
  },

  async saveDish(dish) {
    if (isSupabaseActive) {
      try {
        const payload = {
          id: dish.id,
          name: dish.name,
          veg_type: dish.vegType,
          price_type: dish.priceType,
          specific_price: String(dish.specificPrice || ''),
          available: dish.available
        };
        const { error } = await supabaseClient
          .from('vege_bento_main_dishes')
          .upsert(payload);
        if (error) console.error('Supabase saveDish error:', error);
      } catch (err) {
        console.error('Supabase saveDish exception:', err);
      }
    }
    
    // 更新 LocalStorage 模式以作同步備份
    const dishes = await this.getDishes();
    const index = dishes.findIndex(d => d.id === dish.id);
    if (index > -1) {
      dishes[index] = dish;
    } else {
      dishes.push(dish);
    }
    localStorage.setItem('vege_bento_main_dishes', JSON.stringify(dishes));
  },

  async deleteDish(id) {
    if (isSupabaseActive) {
      try {
        const { error } = await supabaseClient
          .from('vege_bento_main_dishes')
          .delete()
          .eq('id', id);
        if (error) console.error('Supabase deleteDish error:', error);
      } catch (err) {
        console.error('Supabase deleteDish exception:', err);
      }
    }
    
    const dishes = await this.getDishes();
    const filtered = dishes.filter(d => d.id !== id);
    localStorage.setItem('vege_bento_main_dishes', JSON.stringify(filtered));
  },

  // === 2. 訂單管理 (Orders) ===
  async getOrders() {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_orders')
          .select('*')
          .order('created_at', { ascending: false });



        if (error) {
          console.error('Supabase getOrders error:', error);
          return this.getLocalOrders();
        }

        // Map DB snake_case → front-end camelCase
        return (data || []).map(row => ({
          id: row.id,
          unit: row.unit,
          userName: row.user_name,
          userPhone: row.user_phone,
          isCustomized: row.is_customized,
          needTableware: row.need_tableware,
          needReceipt: row.need_receipt,
          deliveryTime: row.delivery_time,
          deliveryAddress: row.delivery_address,
          scheduledDate: row.scheduled_date,
          note: row.note,
          totalAmount: row.total_amount,
          status: row.status,
          items: row.items,
          timestamp: row.timestamp,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        }));
      } catch (err) {
        console.error('Supabase 讀取訂單失敗:', err);
        return this.getLocalOrders();
      }
    }

    return this.getLocalOrders();
  },

  async saveOrder(order) {
    // 儲存到 Supabase（若啟用），並回傳伺服器結果；否則只更新本地備援
    if (isSupabaseActive) {
      try {
        const payload = {
          id: String(order.id),
          unit: order.unit,
          user_name: order.userName,
          user_phone: order.userPhone || '',
          need_tableware: order.needTableware,
          need_receipt: order.needReceipt || false,
          is_customized: order.isCustomized,
          delivery_time: order.deliveryTime,
          delivery_address: order.deliveryAddress || '',
          scheduled_date: order.scheduledDate || '',
          timestamp: order.timestamp,
          created_at: order.createdAt || new Date().toISOString(),
          status: order.status,
          total_amount: order.totalAmount,
          note: order.note || '',
          items: order.items
        };

        const { data, error } = await supabaseClient
          .from('vege_bento_orders')
          .upsert(payload);

        if (error) throw error;

        const orders = this.getLocalOrders();
        const index = orders.findIndex(o => o.id === order.id);
        if (index > -1) {
          orders[index] = order;
        } else {
          orders.push(order);
        }
        localStorage.setItem('vege_bento_orders', JSON.stringify(orders));

        return data;
      } catch (err) {
        console.error('Supabase 寫入訂單失敗，啟用 LocalStorage 備援:', err);
        // 繼續走本地備援流程
      }
    }

    // 本地儲存（降級)
    const orders = this.getLocalOrders();
    const index = orders.findIndex(o => o.id === order.id);
    if (index > -1) {
      orders[index] = order;
    } else {
      orders.push(order);
    }
    localStorage.setItem('vege_bento_orders', JSON.stringify(orders));
    return orders;
  },

  async deleteOrder(id) {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_orders')
          .delete()
          .eq('id', String(id));

        if (error) throw error;
        // 同步本地
        const orders = this.getLocalOrders();
        const filtered = orders.filter(o => o.id !== id);
        localStorage.setItem('vege_bento_orders', JSON.stringify(filtered));
        return data;
      } catch (err) {
        console.error('Supabase 刪除訂單失敗:', err);
      }
    }

    const orders = this.getLocalOrders();
    const filtered = orders.filter(o => o.id !== id);
    localStorage.setItem('vege_bento_orders', JSON.stringify(filtered));
    return filtered;
  },

  async clearAllOrders() {
    if (isSupabaseActive) {
      try {
        const { error } = await supabaseClient
          .from('vege_bento_orders')
          .delete()
          .neq('id', '0'); // 刪除所有 ID
        if (error) console.error('Supabase clearAllOrders error:', error);
      } catch (err) {
        console.error('Supabase clearAllOrders exception:', err);
      }
    }
    localStorage.setItem('vege_bento_orders', JSON.stringify([]));
  },

  // === 3. 輪播照片管理 (Photo Slides) ===
  async getPhotoSlides() {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_photo_slides')
          .select('*')
          .order('id', { ascending: true });
        if (!error && data) return data;
        console.error('Supabase getPhotoSlides error:', error);
      } catch (err) {
        console.error('Supabase getPhotoSlides exception:', err);
      }
    }
    
    const stored = localStorage.getItem('vege_bento_photo_slides');
    return stored ? JSON.parse(stored) : null;
  },

  async savePhotoSlides(slides) {
    if (isSupabaseActive) {
      try {
        // 先清空再重新插入，以模擬完整覆蓋
        await supabaseClient.from('vege_bento_photo_slides').delete().neq('id', 0);
        if (slides.length > 0) {
          const { error } = await supabaseClient
            .from('vege_bento_photo_slides')
            .insert(slides.map(s => ({ src: s.src, label: s.label })));
          if (error) console.error('Supabase savePhotoSlides error:', error);
        }
      } catch (err) {
        console.error('Supabase savePhotoSlides exception:', err);
      }
    }
    localStorage.setItem('vege_bento_photo_slides', JSON.stringify(slides));
  },

  // === 4. 公告內容管理 (Announcements) ===
  async getAnnouncements() {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_announcements')
          .select('*')
          .order('id', { ascending: true });
        if (!error && data) return data;
        console.error('Supabase getAnnouncements error:', error);
      } catch (err) {
        console.error('Supabase getAnnouncements exception:', err);
      }
    }
    
    const stored = localStorage.getItem('vege_bento_announcements');
    return stored ? JSON.parse(stored) : null;
  },

  async saveAnnouncements(announcements) {
    if (isSupabaseActive) {
      try {
        await supabaseClient.from('vege_bento_announcements').delete().neq('id', 0);
        if (announcements.length > 0) {
          const { error } = await supabaseClient
            .from('vege_bento_announcements')
            .insert(announcements.map(a => ({ title: a.title, body: a.body })));
          if (error) console.error('Supabase saveAnnouncements error:', error);
        }
      } catch (err) {
        console.error('Supabase saveAnnouncements exception:', err);
      }
    }
    localStorage.setItem('vege_bento_announcements', JSON.stringify(announcements));
  },

  // === 6. 管理員每日排程主菜 (Planned Menus by Date) ===
  async getPlannedMenus() {
    let plans = [];
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_planned_menus')
          .select('*')
          .order('date', { ascending: true });
        if (!error && data) {
          plans = (data || []).map(row => ({ date: row.date, dishIds: row.dish_ids || [], priceOverrides: row.price_overrides || {} }));
          const refreshed = this.refreshPlannedMenusWindow(plans);
          if (refreshed.changed) {
            await this.savePlannedMenus(refreshed.plans);
          }
          return refreshed.plans;
        }
        console.error('Supabase getPlannedMenus error:', error);
      } catch (err) {
        console.error('Supabase getPlannedMenus exception:', err);
      }
    }
    const stored = localStorage.getItem('vege_bento_planned_menus');
    plans = stored ? JSON.parse(stored) : [];
    const refreshed = this.refreshPlannedMenusWindow(plans);
    if (refreshed.changed) {
      localStorage.setItem('vege_bento_planned_menus', JSON.stringify(refreshed.plans));
    }
    return refreshed.plans;
  },

  async savePlannedMenus(plans) {
    // plans: [{ date: 'YYYY-MM-DD', dishIds: [id,...] }, ...]
    localStorage.setItem('vege_bento_planned_menus', JSON.stringify(plans));
    if (isSupabaseActive) {
      try {
        // simplistic strategy: delete all and insert provided
        await supabaseClient.from('vege_bento_planned_menus').delete().neq('date', '');
        if (plans.length > 0) {
          const payload = plans.map(p => ({ date: p.date, dish_ids: p.dishIds, price_overrides: p.priceOverrides || {} }));
          const { error } = await supabaseClient.from('vege_bento_planned_menus').insert(payload);
          if (error) console.error('Supabase savePlannedMenus insert error:', error);
        }
      } catch (err) {
        console.error('Supabase savePlannedMenus exception:', err);
      }
    }
  },

  // === 5. 管理員設置 (Admin Settings) ===
  async getAdminSettings() {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_admin_settings')
          .select('*')
          .single();
        if (!error && data) {
          const stored = localStorage.getItem('vege_bento_admin_settings');
          const localSettings = stored ? JSON.parse(stored) : {};
          const cloudSettings = {
            clientFontSize: data.client_font_size ?? 14,
            adminFontSize: data.admin_font_size ?? 13,
            requireReceipt: !!data.require_receipt,
            receiptByDefault: !!data.receipt_by_default,
            defaultDeliveryAddress: data.default_delivery_address || '',
            deliveryAddressHint: data.delivery_address_hint || '',
            requireDeliveryAddress: !!data.require_delivery_address,
            orderClosed: !!data.order_closed,
            orderClosedAt: data.order_closed_at || null,
            orderResetTime: data.order_reset_time || '14:00',
            colorPassword: Array.isArray(data.color_password) ? data.color_password : (localSettings.colorPassword || ['黃', '紅', '紅'])
          };
          const merged = { ...localSettings, ...cloudSettings };
          localStorage.setItem('vege_bento_admin_settings', JSON.stringify(merged));
          return merged;
        }
        if (error && error.code !== 'PGRST116') {
          console.error('Supabase getAdminSettings error:', error);
        }
      } catch (err) {
        console.error('Supabase getAdminSettings exception:', err);
      }
    }

    const stored = localStorage.getItem('vege_bento_admin_settings');
    return stored ? JSON.parse(stored) : null;
  },

  async saveAdminSettings(settings) {
    localStorage.setItem('vege_bento_admin_settings', JSON.stringify(settings));

    if (isSupabaseActive) {
      try {
        const payload = {
          id: 1,
          client_font_size: settings.clientFontSize,
          admin_font_size: settings.adminFontSize,
          require_receipt: settings.requireReceipt,
          receipt_by_default: settings.receiptByDefault,
          default_delivery_address: settings.defaultDeliveryAddress || '',
          delivery_address_hint: settings.deliveryAddressHint || '',
          require_delivery_address: settings.requireDeliveryAddress,
          order_closed: !!settings.orderClosed,
          order_closed_at: settings.orderClosedAt || null,
          order_reset_time: settings.orderResetTime || '14:00'
        };
        if (Array.isArray(settings.colorPassword)) {
          payload.color_password = settings.colorPassword;
        }
        const { error } = await supabaseClient
          .from('vege_bento_admin_settings')
          .upsert(payload);
        if (error) {
          console.warn('Supabase saveAdminSettings initial attempt error:', error);
          // 若因新增欄位色碼報錯，嘗試移除 color_password 後重試以保證核心控制設定成功寫入
          delete payload.color_password;
          const { error: retryError } = await supabaseClient
            .from('vege_bento_admin_settings')
            .upsert(payload);
          if (retryError) console.error('Supabase saveAdminSettings retry error:', retryError);
        }
      } catch (err) {
        console.error('Supabase saveAdminSettings exception:', err);
      }
    }
  },

  async syncLocalDataToCloud() {
    if (!isSupabaseActive) {
      throw new Error('Supabase 尚未啟用，請先確認 js/config.js 的 URL/KEY 與網路連線。');
    }

    const localOrders = this.getLocalOrders();
    const localDishes = JSON.parse(localStorage.getItem('vege_bento_main_dishes') || '[]');
    const localSlides = JSON.parse(localStorage.getItem('vege_bento_photo_slides') || '[]');
    const localAnnouncements = JSON.parse(localStorage.getItem('vege_bento_announcements') || '[]');
    const localSettings = JSON.parse(localStorage.getItem('vege_bento_admin_settings') || 'null');
    const localPlanned = JSON.parse(localStorage.getItem('vege_bento_planned_menus') || '[]');

    for (const dish of localDishes) {
      await this.saveDish(dish);
    }
    for (const order of localOrders) {
      await this.saveOrder(order);
    }
    if (localSlides.length > 0) {
      await this.savePhotoSlides(localSlides);
    }
    if (localAnnouncements.length > 0) {
      await this.saveAnnouncements(localAnnouncements);
    }
    if (localSettings) {
      await this.saveAdminSettings(localSettings);
    }
    if (localPlanned && localPlanned.length > 0) {
      await this.savePlannedMenus(localPlanned);
    }

    return {
      orders: localOrders.length,
      dishes: localDishes.length,
      slides: localSlides.length,
      announcements: localAnnouncements.length,
      settings: localSettings ? 1 : 0
    };
  },

  // 匯入訂單檔案 (CSV / TSV) 到 Supabase（或 LocalStorage 作為備援）
  async importOrdersFromFile(file) {
    if (!file) throw new Error('No file provided');

    const readText = (f) => new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = (e) => reject(e);
      fr.readAsText(f);
    });

    const text = await readText(file);
    if (!text || String(text).trim() === '') throw new Error('File is empty');

    // 簡單判斷分隔符：若為 .tsv 或檔案內含 tab 而非逗號，視為 TSV
    const isTSV = file.name.toLowerCase().endsWith('.tsv') || (text.indexOf('\t') !== -1 && text.indexOf(',') === -1);
    const delim = isTSV ? '\t' : ',';

    const lines = String(text).split(/\r\n|\n/).filter(l => l.trim() !== '');
    if (lines.length < 2) throw new Error('No data rows found in file');

    const rawHeaders = lines[0].split(delim).map(h => h.trim());
    const headerPattern = /^[A-Za-z0-9_-]+$/;
    // validate headers
    for (const h of rawHeaders) {
      const norm = h.replace(/\s+/g, '_').replace(/[^A-Za-z0-9_-]/g, '');
      if (!headerPattern.test(norm)) throw new Error('Invalid header name: ' + h);
    }

    const toSnake = (s) => String(s || '').trim().replace(/\s+/g, '_')
      .replace(/([A-Z])/g, '_$1').replace(/__+/g, '_').toLowerCase().replace(/^_/, '');

    const headers = rawHeaders.map(h => toSnake(h));

    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(delim).map(c => c.trim());
      if (cols.length === 1 && headers.length > 1) {
        // tolerate single-column rows (skip)
        continue;
      }
      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        const key = headers[j];
        let val = cols[j] !== undefined ? cols[j] : '';
        if (['need_tableware', 'need_receipt', 'is_customized'].includes(key)) {
          const v = String(val).toLowerCase();
          obj[key] = (v === '1' || v === 'true' || v === 'yes' || v === 'y');
        } else if (key === 'items') {
          try {
            obj[key] = val ? JSON.parse(val) : [];
          } catch (err) {
            // naive fallback: try splitting by ';' into minimal item objects
            if (!val) obj[key] = [];
            else obj[key] = val.split(';').map(s => ({ name: s.trim(), quantity: 1 }));
          }
        } else if (key === 'total_amount') {
          obj[key] = val === '' ? 0 : Number(val);
        } else {
          obj[key] = val;
        }
      }
      // ensure an id
      if (!obj.id) obj.id = 'imp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      rows.push(obj);
    }

    if (rows.length === 0) throw new Error('No valid rows parsed');

    if (!isSupabaseActive) {
      // fallback: merge into local storage
      const local = this.getLocalOrders();
      for (const r of rows) {
        const order = {
          id: String(r.id),
          unit: r.unit || '',
          userName: r.user_name || r.userName || '',
          userPhone: r.user_phone || r.userPhone || '',
          isCustomized: !!r.is_customized,
          needTableware: !!r.need_tableware,
          needReceipt: !!r.need_receipt,
          deliveryTime: r.delivery_time || r.deliveryTime || '',
          deliveryAddress: r.delivery_address || r.deliveryAddress || '',
          note: r.note || '',
          totalAmount: r.total_amount || r.totalAmount || 0,
          status: r.status || '未接單',
          items: r.items || [],
          timestamp: r.timestamp || new Date().toISOString(),
          createdAt: r.created_at || null,
          updatedAt: r.updated_at || null
        };
        local.push(order);
      }
      localStorage.setItem('vege_bento_orders', JSON.stringify(local));
      return { inserted: rows.length, source: 'local' };
    }

    try {
      const { data, error } = await supabaseClient.from('vege_bento_orders').upsert(rows);
      if (error) throw error;
      return { inserted: Array.isArray(data) ? data.length : rows.length, source: 'supabase', data };
    } catch (err) {
      console.error('Supabase import error:', err);
      throw err;
    }
  },
};
