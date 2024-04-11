import './App.css';
import axios from 'axios';
import React, { useState } from 'react';
import Map from './Map';

function App() {
  const [searchFormData, setSearchFormData] = useState({
    searchTerm: '',
    onlyInBox: false,
    bbox:{
      minLat: -90,
      minLon: -180,
      maxLat: 90,
      maxLon: 180,
    }
  }); //searchTerm, onlyInBox, bbox {minLat, inLon, maxLat, maxLon}
  const [responseData, setResponseData] = useState('');

  const handleSubmit = async (e) => {

    if(searchFormData.searchTerm.length == 0){
      console.log("Search term can't be empty")
      return
    }
    
    e.preventDefault();
    try {
      const response = await axios.post('/api/search', { formData: searchFormData });
      setResponseData(response.data);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const setSearch = (e) => {
    setSearchFormData(prev => ({...prev, searchTerm: e.target.value}));
  };

  const setInBox = (e) => {
    setSearchFormData(prev => ({...prev, onlyInBox: e.target.checked}));
  };

  return (
    <div className="App">
      <div className="menu-panel">
        <div className="search">
          <h2>Search</h2>
          <input type="text" id="search" placeholder="what do you wish to see?" value="" onChange={setSearch}/>
          <input type="checkbox" id="in-box" onChange={setInBox}></input>
          <label for="in-box">Only in Box</label>
          <button id="submit-search" onClick={handleSubmit}>Search</button>
          <h3>Results:</h3>
          <div>{responseData}</div>
        </div>
        <div className="convert">
          <h2>Convert</h2>

        </div>
       
      </div>
      <div className="map">
        <Map />
      </div>
    </div>
  );
}

export default App;
