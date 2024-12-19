const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const cookieParser = require('cookie-parser');

const jwt = require('jsonwebtoken');
const express = require('express');
require('dotenv').config();
const cors = require('cors');
const app = express();
const port = process.env.PORT || 5000;
app.use(
  cors({
    origin: ['http://localhost:5173'],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: 'Unauthrized access' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.send({ message: 'authfaild' });
    }
    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.yzegd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Database and Collections
    const database = client.db('jobprotalDB');
    const jobprotalCollection = database.collection('jobs');

    const jobAplicationcollection = database.collection('jobApplycation');

    //AUTH Relrted APIs
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '1h' });

      res
        .cookie('token', token, {
          httpOnly: true,
          secure: false,
        })

        .send({ success: true });
    });

    app.post('/logout', (req, res) => {
      res
        .clearCookie('token', {
          httpOnly: true,
          secure: false,
        })
        .send({ succses: true });
    });

    app.get('/jobs', async (req, res) => {
      const email = req.query.email;
      let query = {};
      if (email) {
        query = { hr_email: email };
      }
      const cursor = jobprotalCollection.find(query);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get('/jobs/:id', async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await jobprotalCollection.findOne(query);
        if (!result) {
          res.status(404).send({ error: 'Equipment not found' });
        } else {
          res.send(result);
        }
      } catch (error) {
        res.status(500).send({ error: 'Failed to fetch equipment' });
      }
    });

    //job application

    app.get('/job-application', verifyToken, async (req, res) => {
      const email = req.query.email;
      const query = { applicant_email: email };
      if (req.user.email !== req.query.email) {
        return res.status(403).send({ message: 'forbiden acses' });
      }

      const result = await jobAplicationcollection.find(query).toArray();

      // fokira way to aggregate data
      for (const application of result) {
        // console.log(application.job_id)
        const query1 = { _id: new ObjectId(application.job_id) };
        const job = await jobprotalCollection.findOne(query1);
        if (job) {
          application.title = job.title;
          application.location = job.location;
          application.company = job.company;
          application.company_logo = job.company_logo;
        }
      }

      res.send(result);
    });

    app.post('/job-application', async (req, res) => {
      const application = req.body;
      const result = await jobAplicationcollection.insertOne(application);

      const id = application.job_id;
      const query = { _id: new ObjectId(id) };
      const job = await jobprotalCollection.findOne(query);
      let newCount = 0;
      if (job.applicationCount) {
        newCount = job.applicationCount + 1;
      } else {
        newCount = 1;
      }

      // now update the job info
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          applicationCount: newCount,
        },
      };

      const updateResult = await jobprotalCollection.updateOne(
        filter,
        updatedDoc
      );

      res.send(result);
    });

    app.post('/jobs', async (req, res) => {
      const addItemList = req.body;
      const result = await jobprotalCollection.insertOne(addItemList);
      res.send(result);
    });

    app.get('/job-applications/jobs/:job_id', async (req, res) => {
      const jobId = req.params.job_id;
      const query = { job_id: jobId };
      const result = await jobAplicationcollection.find(query).toArray();
      res.send(result);
    });

    app.patch('/job-applications/:id', async (req, res) => {
      const id = req.params.id;
      const data = req.body;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          status: data.status,
        },
      };
      const result = await jobAplicationcollection.updateOne(
        filter,
        updatedDoc
      );
      res.send(result);
    });

    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Welcome to the Sports Equipment API server!');
});

// Start server
app.listen(port, () => {
  console.log('Server running on port', port);
});
