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
  // === 1. 主菜管理 (Main Dishes) ===
  async getDishes() {
    if (isSupabaseActive) {
      try {
        const { data, error } = await supabaseClient
          .from('vege_bento_main_dishes')
          .select('*')
          .order('id', { ascending: true });
        if (!error && data) return data;
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
          .order('timestamp', { ascending: false });
        
        if (!error && data) {
          // 將資料欄位對應回 Alpine.js 所預期的駝峰命名法
          return data.map(ord => ({
            id: ord.id,
            unit: ord.unit,
            userName: ord.user_name,
            needTableware: ord.need_tableware,
            isCustomized: ord.is_customized,
            deliveryTime: ord.delivery_time,
            deliveryAddress: ord.delivery_address,
            timestamp: ord.timestamp,
            status: ord.status,
            totalAmount: ord.total_amount,
            note: ord.note,
            items: ord.items
          }));
        }
        console.error('Supabase getOrders error:', error);
      } catch (err) {
        console.error('Supabase getOrders exception:', err);
      }
    }
    
    const stored = localStorage.getItem('vege_bento_orders');
    return stored ? JSON.parse(stored) : [];
  },

  async saveOrder(order) {
    if (isSupabaseActive) {
      try {
        const payload = {
          id: String(order.id),
          unit: order.unit,
          user_name: order.userName,
          need_tableware: order.needTableware,
          is_customized: order.isCustomized,
          delivery_time: order.deliveryTime,
          delivery_address: order.deliveryAddress || '',
          timestamp: order.timestamp,
          status: order.status,
          total_amount: order.totalAmount,
          note: order.note || '',
          items: order.items
        };
        const { error } = await supabaseClient
          .from('vege_bento_orders')
          .upsert(payload);
        if (error) console.error('Supabase saveOrder error:', error);
      } catch (err) {
        console.error('Supabase saveOrder exception:', err);
      }
    }
    
    // 更新本地
    const orders = await this.getOrders();
    const index = orders.findIndex(o => o.id === order.id);
    if (index > -1) {
      orders[index] = order;
    } else {
      orders.push(order);
    }
    localStorage.setItem('vege_bento_orders', JSON.stringify(orders));
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
  }
};
