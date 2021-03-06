const nock = require('nock');
const chai = require('chai');
const config = require('config');
const fs = require('fs');
const path = require('path');
const GeoStore = require('models/geoStore');
const { createRequest } = require('../utils/test-server');
const { createGeostore, ensureCorrectError } = require('../utils/utils');
const { DEFAULT_GEOJSON } = require('../utils/test.constants');

chai.should();

const prefix = '/api/v2/geostore';
let geostoreWDPA;

describe('Geostore v2 tests - Getting geodata by wdpa', () => {
    before(async () => {
        if (process.env.NODE_ENV !== 'test') {
            throw Error(`Running the test suite with NODE_ENV ${process.env.NODE_ENV} may result in permanent data loss. Please use NODE_ENV=test.`);
        }
        if (config.get('cartoDB.user') === null) {
            throw Error(`Carto user not set - please specify a CARTODB_USER env var with it.`);
        }

        nock.cleanAll();
        geostoreWDPA = await createRequest(prefix, 'get');
    });

    it('Getting geodata by wdpa when data doens\'t exist into geostore should return not found', async () => {
        const response = await geostoreWDPA.get('/asdsadas/view');
        ensureCorrectError(response, 'GeoStore not found', 404);
    });

    it('Getting geodata by wdpa should return result', async () => {
        const createdGeostore = await createGeostore();

        const response = await geostoreWDPA.get(`/${createdGeostore.hash}/view`);

        response.status.should.equal(200);
        response.body.should.instanceOf(Object).and.have.property('view_link');
        // eslint-disable-next-line camelcase
        const { view_link } = response.body;
        const expectedGEOJSON = {
            features: [{
                properties: null,
                type: DEFAULT_GEOJSON.features[0].type,
                geometry: DEFAULT_GEOJSON.features[0].geometry,
            }],
            crs: {},
            type: DEFAULT_GEOJSON.type
        };

        view_link.should.match(/^http:\/\/geojson.io\/#data=data:application\/json/);
        const responseJSONEncodedString = view_link.replace('http://geojson.io/#data=data:application/json,', '');
        const responseJSON = JSON.parse(decodeURIComponent(responseJSONEncodedString));

        responseJSON.should.deep.equal(expectedGEOJSON);
    });

    it('Geometries larger than 150000 characters (stringified) are not supported by this endpoint and a 400 Bad Request response is returned', async () => {
        const geojson = JSON.parse(fs.readFileSync(path.join(__dirname, 'resources', 'giant-geom.json')).toString());
        const geostore = await createGeostore({}, geojson);
        const response = await geostoreWDPA.get(`/${geostore.hash}/view`);

        response.status.should.equal(400);
        response.body.should.have.property('errors').and.have.length(1);
        response.body.errors[0].should.have.property('detail').and.equal('Geometry too large, please try again with a smaller geometry.');
    });

    afterEach(async () => {
        await GeoStore.deleteMany({}).exec();

        if (!nock.isDone()) {
            throw new Error(`Not all nock interceptors were used: ${nock.pendingMocks()}`);
        }
    });
});
