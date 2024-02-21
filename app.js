const express = require('express')
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const dbpath = path.join(__dirname, 'covid19IndiaPortal.db')
const app = express()
app.use(express.json())
let db = null

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbpath,
      driver: sqlite3.Database,
    })

    app.listen(3000, () => {
      console.log('Server Running At http://localhost:3000/')
    })
  } catch (e) {
    console.log(`Db error : ${e.message}`)
    process.exit(1)
  }
}

initializeDbAndServer()

const convertToStateObject = dbObj => {
  return {
    stateId: dbObj.state_id,
    stateName: dbObj.state_name,
    population: dbObj.population,
  }
}

const convertToDistrictObject = dbObj => {
  return {
    districtId: dbObj.district_id,
    districtName: dbObj.district_name,
    stateId: dbObj.state_id,
    cases: dbObj.cases,
    cured: dbObj.cured,
    active: dbObj.active,
    deaths: dbObj.death,
  }
}

function authenticateToken(request, response, next) {
  let jwtToken
  const authHeader = request.headers['authentication']
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(' ')[1]
  }
  if (authHeader === undefined) {
    response.status(401)
    response.send('Invalid jwt Token')
  } else {
    jwt.verify(jwtToken, 'My_secret_token', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid jwt Token')
      } else {
        next()
      }
    })
  }
}

app.post('/login/', authenticateToken, async (request, response) => {
  const {username, password} = request.body
  const loginQuery = `SELECT * FROM user WHERE username = ${username};`
  const dbUser = await db.get(loginQuery)
  if (dbUser === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const comparedPassword = await bcrypt.compare(password, dbUser.password)
    if (comparedPassword === true) {
      const payload = {
        username: username,
      }
      const jwtToken = await jwt.sign(payload, 'My_secret_token')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

app.get('/states/', authenticateToken, async (request, response) => {
  const getStateQuery = `SELECT * FROM state;`
  const getResponse = await db.all(getStateQuery)
  response.send(getResponse.map(each => convertToStateObject(each)))
})

app.get('/states/:stateId/', authenticateToken, async (request, response) => {
  const {stateId} = request.params
  const getStateQuery = `SELECT * FROM state WHERE state_id = ${stateId};`
  const getResponse = await db.get(getStateQuery)
  response.send(convertToStateObject(getResponse))
})

app.post('/districts/', authenticateToken, async (request, response) => {
  const {stateId, districtName, cases, cured, active, deaths} = request.body
  const postDistrictQuery = `INSERT INTO district(state_id,district_name,cases,cured,active,deaths) VALUES ('${stateId}','${districtName}','${cases}','${cured}','${active}','${deaths}'); `
  const postResponse = await db.run(postDistrictQuery)
  response.send('District Successfully Added')
})

app.get(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrictQuery = `SELECT * FROM district WHERE district_id = ${districtId};`
    const getResponse = await db.get(getDistrictQuery)
    response.send(convertToDistrictObject(getResponse))
  },
)

app.delete(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const deleteQuery = `DELETE FROM district WHERE district_id = ${districtId};`
    await db.run(deleteQuery)
    response.send('District Removed')
  },
)

app.put(
  '/districts/:districtId/',
  authenticateToken,
  async (request, response) => {
    const {districtId} = request.params
    const {stateId, districtName, cases, cured, active, deaths} = request.body
    const putQuery = `UPDATE district SET state_id = '${stateId}' ,district_name = '${districtName}',cases = '${cases}',cured = '${cured}', active = '${active}',deaths = '${deaths}' WHERE district_id = ${districtId}; `
    await db.run(putQuery)
    response.send('District Details Updated')
  },
)

app.get(
  '/states/:stateId/stats/',
  authenticateToken,
  async (request, response) => {
    const {stateId} = request.params
    const getQuery = `SELECT SUM(cases), SUM(cured), SUM(active),SUM(deaths) FROM district WHERE state_id = ${stateId};`
    const stats = await db.get(getQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)
module.exports = app
