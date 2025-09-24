const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const moment = require('moment');
require('moment/locale/fr');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

const ADMIN_PASSWORD_HASH = '$2b$10$22mB907tA1jG04T3d8qUo.d4n5r6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0';

const pool = mysql.createPool({
  host: 'localhost',
  user: 'root',
  database: 'presence_ny_havana',
  password: 'Falitiana07!',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- ROUTES POUR L'ENREGISTREMENT ET LA GESTION DES EMPLOYES ---
app.post('/api/register', upload.single('photo'), async (req, res) => {
  const { nom, prenom, matricule, dateDeNaissance, tel, mail, motDePasse } = req.body;
  const photoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!nom || !prenom || !matricule || !dateDeNaissance || !tel || !mail || !motDePasse) {
    if (req.file) {
        fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Tous les champs sont obligatoires.', success: false });
  }

  try {
    const hashedPassword = await bcrypt.hash(motDePasse, 10);
    const query = `
      INSERT INTO employees (nom, prenom, matricule, date_de_naissance, tel, mail, mot_de_passe, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?);
    `;
    const values = [nom, prenom, matricule, dateDeNaissance, tel, mail, hashedPassword, photoPath];
    await pool.execute(query, values);
    res.status(201).json({ message: 'Employé enregistré avec succès !', success: true, photo_url: photoPath });
  } catch (error) {
    if (req.file) {
        fs.unlinkSync(req.file.path);
    }
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ message: 'Cet email ou ce matricule existe déjà.', success: false });
    }
    console.error('Erreur lors de l\'enregistrement :', error);
    res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
  }
});

app.get('/api/employees', async (req, res) => {
    try {
        const query = 'SELECT id, nom, prenom, matricule, tel, mail, date_de_naissance, photo_url FROM employees ORDER BY nom ASC';
        const [rows] = await pool.execute(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des employés :', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
    }
});

app.delete('/api/employees/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.execute('SELECT photo_url FROM employees WHERE id = ?', [id]);
    const photoUrl = rows.length > 0 ? rows[0].photo_url : null;

    await pool.execute('DELETE FROM pointages WHERE employee_id = ?', [id]);
    await pool.execute('DELETE FROM employees WHERE id = ?', [id]);
    
    if (photoUrl) {
        const filePath = path.join(__dirname, photoUrl);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    
    res.status(200).json({ message: 'L\'employé et ses pointages ont été supprimés avec succès !', success: true });
  } catch (error) {
      console.error('Erreur lors de la suppression de l\'employé :', error);
      res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
  }
});

app.put('/api/employees/:id', upload.single('photo'), async (req, res) => {
  const { id } = req.params;
  const { nom, prenom, matricule, dateDeNaissance, tel, mail } = req.body;
  const newPhotoPath = req.file ? `/uploads/${req.file.filename}` : null;

  if (!nom || !prenom || !matricule || !dateDeNaissance || !tel || !mail) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({ message: 'Tous les champs de texte sont obligatoires.', success: false });
  }

  try {
    let updateQuery = `
      UPDATE employees
      SET nom = ?, prenom = ?, matricule = ?, date_de_naissance = ?, tel = ?, mail = ?
      WHERE id = ?;
    `;
    let values = [nom, prenom, matricule, dateDeNaissance, tel, mail, id];

    if (newPhotoPath) {
      const [rows] = await pool.execute('SELECT photo_url FROM employees WHERE id = ?', [id]);
      const oldPhotoUrl = rows.length > 0 ? rows[0].photo_url : null;
      if (oldPhotoUrl) {
          const oldFilePath = path.join(__dirname, oldPhotoUrl);
          if (fs.existsSync(oldFilePath)) {
              fs.unlinkSync(oldFilePath);
          }
      }
      
      updateQuery = `
        UPDATE employees
        SET nom = ?, prenom = ?, matricule = ?, date_de_naissance = ?, tel = ?, mail = ?, photo_url = ?
        WHERE id = ?;
      `;
      values = [nom, prenom, matricule, dateDeNaissance, tel, mail, newPhotoPath, id];
    }
    
    await pool.execute(updateQuery, values);
    res.status(200).json({ message: 'Employé mis à jour avec succès !', success: true, photo_url: newPhotoPath });

  } catch (error) {
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      if (error.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ message: 'Cet email ou ce matricule existe déjà.', success: false });
      }
      console.error('Erreur lors de la mise à jour de l\'employé :', error);
      res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
  }
});

// --- ROUTES POUR LA CONNEXION ET LE POINTAGE ---
app.post('/api/verify-admin-password', async (req, res) => {
  const { motDePasse } = req.body;
  try {
    const match = await bcrypt.compare(motDePasse, ADMIN_PASSWORD_HASH);
    if (match) {
        res.status(200).json({ message: 'Mot de passe correct.', success: true });
    } else {
        res.status(401).json({ message: 'Mot de passe incorrect.', success: false });
    }
  } catch (error) {
    console.error('Erreur lors de la vérification du mot de passe :', error);
    res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
  }
});

app.post('/api/login', async (req, res) => {
    const { mail, motDePasse } = req.body;
    if (!mail || !motDePasse) {
      return res.status(400).json({ message: 'Veuillez remplir les champs email et mot de passe.' });
    }
    try {
      const query = 'SELECT id, nom, prenom, mot_de_passe FROM employees WHERE mail = ?';
      const [rows] = await pool.execute(query, [mail]);
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
      }
      const user = rows[0];
      const match = await bcrypt.compare(motDePasse, user.mot_de_passe);
      if (!match) {
        return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
      }
      res.status(200).json({ message: 'Connexion réussie !', user: { id: user.id, nom: user.nom, prenom: user.prenom } });
    } catch (error) {
      console.error('Erreur lors de la connexion :', error);
      res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
    }
});

app.post('/api/login-pointage', async (req, res) => {
    const { tel, motDePasse } = req.body;
    if (!tel || !motDePasse) {
      return res.status(400).json({ message: 'Veuillez remplir tous les champs.' });
    }
    try {
      const query = 'SELECT id, nom, prenom, photo_url, mot_de_passe FROM employees WHERE tel = ?';
      const [rows] = await pool.execute(query, [tel]);
      if (rows.length === 0) {
        return res.status(401).json({ message: 'Numéro de téléphone ou mot de passe incorrect.' });
      }
      const employee = rows[0];
      const match = await bcrypt.compare(motDePasse, employee.mot_de_passe);
      if (!match) {
        return res.status(401).json({ message: 'Numéro de téléphone ou mot de passe incorrect.' });
      }
      res.status(200).json({
        message: 'Connexion réussie!',
        employee: {
          id: employee.id,
          nom: employee.nom,
          prenom: employee.prenom,
          photo_url: employee.photo_url
        }
      });
    } catch (error) {
      console.error('Erreur lors de la connexion pour le pointage:', error);
      res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
    }
});

app.post('/api/validate-password', async (req, res) => {
    const { matricule, motDePasse } = req.body;
    if (!matricule || !motDePasse) {
        return res.status(400).json({ message: 'Matricule et mot de passe sont requis.' });
    }
    try {
        const query = 'SELECT mot_de_passe FROM employees WHERE matricule = ?';
        const [rows] = await pool.execute(query, [matricule]);
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Employé non trouvé.' });
        }
        const hashedPassword = rows[0].mot_de_passe;
        const match = await bcrypt.compare(motDePasse, hashedPassword);
        if (match) {
            res.status(200).json({ message: 'Mot de passe valide.' });
        } else {
            res.status(401).json({ message: 'Mot de passe incorrect.' });
        }
    } catch (error) {
        console.error('Erreur de validation du mot de passe:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
    }
});

// --- ROUTES POUR LA GENERATION ET LA VERIFICATION DU CODE DE POINTAGE ---
app.post('/api/generate-code', async (req, res) => {
    const { employeeId } = req.body;
    const now = moment();
    
    try {
        const [rows] = await pool.execute('SELECT code_gen_timestamp, code_request_count FROM employees WHERE id = ?', [employeeId]);
        
        if (rows.length === 0) {
            return res.status(404).json({ message: 'Employé non trouvé.' });
        }
        
        const newRequestCount = rows[0].code_request_count + 1;

        const code = Math.floor(100000 + Math.random() * 900000).toString();
        const expirationTime = now.add(15, 'seconds').format('YYYY-MM-DD HH:mm:ss'); 
        
        const updateQuery = `
            UPDATE employees 
            SET code_pointage = ?, code_gen_timestamp = ?, code_request_count = ?
            WHERE id = ?
        `;
        
        await pool.execute(updateQuery, [code, expirationTime, newRequestCount, employeeId]);
        
        res.status(200).json({ message: 'Code généré et envoyé.', code });
        
    } catch (error) {
        console.error('Erreur lors de la génération du code:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
    }
});

app.post('/api/verify-code', async (req, res) => {
    const { employeeId, code } = req.body;
    const now = moment();
    
    try {
        const query = 'SELECT code_pointage, code_gen_timestamp FROM employees WHERE id = ?';
        const [rows] = await pool.execute(query, [employeeId]);

        if (rows.length === 0) {
            return res.status(404).json({ message: 'Employé non trouvé.' });
        }
        
        const employeeCode = rows[0].code_pointage;
        const codeExpirationTime = moment(rows[0].code_gen_timestamp);

        if (now.isAfter(codeExpirationTime)) {
            await pool.execute('UPDATE employees SET code_pointage = NULL WHERE id = ?', [employeeId]);
            return res.status(400).json({ message: 'Le code a expiré. Veuillez générer un nouveau code.' });
        }

        if (employeeCode === code) {
            const date = now.format('YYYY-MM-DD');
            const time = now.format('HH:mm:ss');
            const insertQuery = `
                INSERT INTO pointages (employee_id, date, heure)
                VALUES (?, ?, ?)
            `;
            await pool.execute(insertQuery, [employeeId, date, time]);
            
            await pool.execute('UPDATE employees SET code_pointage = NULL, code_gen_timestamp = NULL, code_request_count = 0 WHERE id = ?', [employeeId]);
            
            res.status(200).json({ message: 'Pointage réussi!', date, time });
        } else {
            res.status(400).json({ message: 'Code incorrect.' });
        }
    } catch (error) {
        console.error('Erreur lors de la vérification du code:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
    }
});

// --- ROUTES POUR L'HISTORIQUE ET LA PRESENCE/ABSENCE ---

app.get('/api/historique', async (req, res) => {
    try {
        const query = `
            SELECT p.id, e.nom, e.prenom, e.photo_url, p.date, p.heure
            FROM pointages p
            JOIN employees e ON p.employee_id = e.id
            ORDER BY p.date DESC, p.heure DESC;
        `;
        const [rows] = await pool.execute(query);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Erreur lors de la récupération de l\'historique:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
    }
});

app.get('/api/today-presence', async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const query = `
            SELECT p.id, e.nom, e.prenom, e.photo_url, p.date, p.heure
            FROM pointages p
            JOIN employees e ON p.employee_id = e.id
            WHERE p.date = ?
            ORDER BY p.heure DESC;
        `;
        const [rows] = await pool.execute(query, [today]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des présences d\'aujourd\'hui:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
    }
});

app.get('/api/today-absence', async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const query = `
            SELECT id, nom, prenom, photo_url
            FROM employees
            WHERE id NOT IN (
                SELECT employee_id FROM pointages WHERE date = ?
            )
            ORDER BY nom ASC;
        `;
        const [rows] = await pool.execute(query, [today]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des absences d\'aujourd\'hui:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
    }
});

app.get('/api/status-per-person', async (req, res) => {
    try {
        const today = moment().format('YYYY-MM-DD');
        const query = `
            SELECT
                e.id,
                e.nom,
                e.prenom,
                e.photo_url,
                CASE WHEN EXISTS (
                    SELECT 1
                    FROM pointages p
                    WHERE p.employee_id = e.id AND p.date = ?
                ) THEN TRUE ELSE FALSE END AS is_present
            FROM
                employees e
            ORDER BY
                e.nom ASC;
        `;
        const [rows] = await pool.execute(query, [today]);
        res.status(200).json(rows);
    } catch (error) {
        console.error('Erreur lors de la récupération des statuts par personne:', error);
        res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
    }
});

app.get('/api/historique/employee/:id', async (req, res) => {
  const employeeId = req.params.id;
  try {
    const query = `
      SELECT id, date, heure
      FROM pointages
      WHERE employee_id = ?
      ORDER BY date DESC, heure DESC;
    `;
    const [rows] = await pool.execute(query, [employeeId]);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique d\'un employé:', error);
    res.status(500).json({ message: 'Une erreur est survenue sur le serveur.', success: false });
  }
});

app.get('/api/employee-status/:id', async (req, res) => {
  const employeeId = req.params.id;
  try {
    const query = `
      SELECT
          DATE_FORMAT(date, '%W') AS day_name,
          MIN(CASE WHEN HOUR(heure) >= 6 AND HOUR(heure) < 12 THEN heure ELSE NULL END) AS am_in,
          MAX(CASE WHEN HOUR(heure) >= 6 AND HOUR(heure) < 12 THEN heure ELSE NULL END) AS am_out,
          MIN(CASE WHEN HOUR(heure) >= 12 AND HOUR(heure) < 18 THEN heure ELSE NULL END) AS pm_in,
          MAX(CASE WHEN HOUR(heure) >= 12 AND HOUR(heure) < 18 THEN heure ELSE NULL END) AS pm_out
      FROM
          pointages
      WHERE
          employee_id = ? AND WEEK(date, 1) = WEEK(CURDATE(), 1) AND YEAR(date) = YEAR(CURDATE())
      GROUP BY
          date
      ORDER BY
          date ASC;
    `;
    const [rows] = await pool.execute(query, [employeeId]);
    const dayMappings = {
      'Monday': 'Lundi',
      'Tuesday': 'Mardi',
      'Wednesday': 'Mercredi',
      'Thursday': 'Jeudi',
      'Friday': 'Vendredi',
      'Saturday': 'Samedi',
      'Sunday': 'Dimanche'
    };
    const formattedRows = rows.map(row => ({
      ...row,
      day_name: dayMappings[row.day_name] || row.day_name,
    }));
    res.status(200).json(formattedRows);
  } catch (error) {
    console.error('Erreur lors de la récupération du statut de l\'employé :', error);
    res.status(500).json({ message: 'Une erreur est survenue sur le serveur.' });
  }
});

app.get('/api/chart/pie', async (req, res) => {
    try {
        const query = `
            SELECT DAY(p.date) AS day_of_month, COUNT(p.id) AS pointage_count
            FROM pointages p
            WHERE MONTH(p.date) = MONTH(CURDATE()) AND YEAR(p.date) = YEAR(CURDATE())
            GROUP BY DAY(p.date)
            ORDER BY day_of_month ASC;
        `;
        const [rows] = await pool.execute(query);
        const formattedData = rows.length > 0 ? rows.map(row => ({
            label: `Jour ${row.day_of_month}`,
            value: row.pointage_count
        })) : [];
        res.status(200).json(formattedData);
    } catch (error) {
        console.error('Erreur lors de la récupération des données pour le pie chart:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.get('/api/chart/bar', async (req, res) => {
    try {
        const query = `
            SELECT WEEK(p.date, 1) AS week_number, COUNT(p.id) AS pointage_count
            FROM pointages p
            WHERE MONTH(p.date) = MONTH(CURDATE()) AND YEAR(p.date) = YEAR(CURDATE())
            GROUP BY week_number
            ORDER BY week_number ASC;
        `;
        const [rows] = await pool.execute(query);
        const labels = rows.length > 0 ? rows.map(row => `Semaine ${row.week_number}`) : [];
        const values = rows.length > 0 ? rows.map(row => row.pointage_count) : [];
        res.status(200).json({ labels, values });
    } catch (error) {
        console.error('Erreur lors de la récupération des données pour le bar chart:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.get('/api/chart/histogram', async (req, res) => {
  try {
    const query = `
      SELECT HOUR(heure) AS hour_of_day, COUNT(id) AS pointage_count
      FROM pointages
      WHERE DATE(date) = CURDATE()
      GROUP BY hour_of_day
      ORDER BY hour_of_day ASC;
    `;
    const [rows] = await pool.execute(query);
    
    const labels = Array.from({ length: 24 }, (_, i) => `${i}h`);
    const values = new Array(24).fill(0);

    rows.forEach(row => {
      values[row.hour_of_day] = row.pointage_count;
    });

    res.status(200).json({ labels, values });
  } catch (error) {
    console.error('Erreur lors de la récupération des données de l\'histogramme:', error);
    res.status(500).json({ message: 'Erreur serveur.' });
  }
});

// ROUTE efa voaova mba hanampy ny 'offset'
app.get('/api/chart/weekly-employee-count', async (req, res) => {
    try {
        const offset = parseInt(req.query.offset) || 0;
        const targetDate = moment().add(offset, 'weeks').format('YYYY-MM-DD');

        const query = `
            SELECT
                DAYOFWEEK(date) AS day_of_week,
                COUNT(DISTINCT employee_id) AS employee_count
            FROM
                pointages
            WHERE
                WEEK(date, 1) = WEEK(?, 1) AND YEAR(date) = YEAR(?)
            GROUP BY
                day_of_week
            ORDER BY
                day_of_week ASC;
        `;
        const [rows] = await pool.execute(query, [targetDate, targetDate]);

        const dayLabels = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
        const labels = dayLabels.slice(1, 7);
        const values = new Array(6).fill(0);

        rows.forEach(row => {
            if (row.day_of_week >= 2 && row.day_of_week <= 7) {
                values[row.day_of_week - 2] = row.employee_count;
            }
        });

        res.status(200).json({ labels, values });
    } catch (error) {
        console.error('Erreur lors de la récupération des données de l\'histogramme hebdomadaire:', error);
        res.status(500).json({ message: 'Erreur serveur.' });
    }
});

app.listen(port, () => {
  console.log(`Le serveur est en cours d'exécution sur http://localhost:${port}`);
});