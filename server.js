// server.js (Node.js 后端)
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const app = express();

// 数据库配置
const db = mysql.createPool({
    host: '127.0.0.1',
    user: 'test1',
    password: '12345678',
    database: 'survey_db',
    waitForConnections: true,
    connectionLimit: 10
});

app.use(cors());
app.use(express.json());

// 邀请码验证接口
app.post('/check-invite-code', async (req, res) => {
    const { code } = req.body;
    
    try {
        const [rows] = await db.execute(`
          SELECT * FROM invite_codes 
          WHERE code = ? 
          AND (expire_time IS NULL OR expire_time > NOW())
          AND used_count < max_usage
        `, [code]);

        if (rows.length > 0) {
            res.json({ valid: true });
        } else {
            res.json({ valid: false });
        }
    } catch (error) {
        console.error('数据库查询失败:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

// 处理表单提交
app.post('/submit-survey', async (req, res) => {
    const connection = await db.getConnection();
    
    try {
      await connection.beginTransaction(); // 开启事务
  
      const { name, telephone, inviteCode, age, gender, source, suggestion } = req.body;
  
      // 1. 原子更新邀请码（检查影响行数）
      const [updateResult] = await connection.query(`
        UPDATE invite_codes 
        SET used_count = used_count + 1 
        WHERE code = ? 
        AND used_count < max_usage
      `, [inviteCode]);

      // 如果邀请码无效或已达使用上限
      if (updateResult.affectedRows === 0) {
        await connection.rollback();
        return res.status(400).json({ error: '邀请码无效或已达使用上限' });
      }
  
      // 2. 插入调查数据
      const [insertResult] = await connection.query(
        `INSERT INTO surveys (name, telephone, inviteCode, age, gender, source, suggestion) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, telephone, inviteCode, age, gender, source, suggestion]
      );
  
      await connection.commit(); // 提交事务
      res.status(201).json({ 
        message: '提交成功',
        surveyId: insertResult.insertId 
      });
  
    } catch (error) {
      await connection.rollback(); // 回滚事务
      console.error('事务执行失败:', error);
      res.status(500).json({ error: '服务器处理请求失败' });
    } finally {
      connection.release(); // 释放连接回连接池
    }
});

// 获取所有调查结果
app.get('/surveys', async (req, res) => {
    try {
      const [results] = await db.query(`
        SELECT * FROM surveys 
        ORDER BY created_at DESC
      `);
      res.json(results);
    } catch (error) {
      console.error('查询失败:', error);
      res.status(500).json({ error: '无法获取调查数据' });
    }
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
