import Container from '@mui/material/Container';
import React, {Component} from 'react';
import '../css/cortext.css';
import AddIcon from '@mui/icons-material/Add';
import '../css/pe-icon-7.css';
import {withStyles} from '@mui/material/styles';

import {logger} from '../utils/logger';
import {chatApi} from '../services/socialApi';

const useStyles = (theme) => ({
  root: {
    flexGrow: 1,
  },
  coverImage: {
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    background: '#fff',
    margin: '0 auto',
  },

  heading: {
    color: '#28315E',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 0,
    [theme.breakpoints.up('md')]: {
      fontSize: 32,
      textAlign: 'center',
    },
  },
  heroHeading: {
    textAlign: 'left',
    fontSize: 28,
    lineHeight: '1.2',
    marginBottom: 20,
    [theme.breakpoints.up('lg')]: {
      fontSize: 44,
    },
  },
  row: {
    display: 'grid',
    alignItems: 'center',
    gridGap: '50px 100px',
    [theme.breakpoints.up('md')]: {
      gridTemplateColumns: '1fr 1fr',
    },
  },
  column1: {
    order: 2,
    [theme.breakpoints.up('md')]: {
      order: 1,
    },
  },
});

class UploadFile extends Component {
  state = {
    // Initially, no file is selected
    selectedFile: null,
  };

  // On file select (from the pop up)
  onFileChange = (event) => {
    // Update the state
    this.setState({selectedFile: event.target.files[0]});
  };

  // On file upload (click the upload button)
  onFileUpload = () => {
    // Create an object of formData
    const formData = new FormData();

    // Update the formData object
    formData.append(
      'myFile',
      this.state.selectedFile,
      this.state.selectedFile.name
    );

    // Details of the uploaded file
    logger.log(this.state.selectedFile);

    // Request made to the backend api
    // Send formData object
    chatApi.post('/api/uploadfile', formData);
  };

  // File content to be displayed after
  // file upload is complete
  fileData = () => {
    if (this.state.selectedFile) {
      return (
        <div>
          <h2>File Details:</h2>
          <p>File Name: {this.state.selectedFile.name}</p>
          <p>File Type: {this.state.selectedFile.type}</p>
          <p>
            Last Modified:{' '}
            {this.state.selectedFile.lastModifiedDate.toDateString()}
          </p>
        </div>
      );
    }
  };

  render() {
    const {classes} = this.props;
    return (
      <React.Fragment>
        <div>
          <p className={`${classes.heading} ${classes.heroHeading} fadeInUp`}>
            Test your own invoices, Now!
          </p>
          <h3>
            Toggle between the demo images or upload your own and extract data
            live.
          </h3>

          <div style={{display: 'grid', marginTop: 15}}>
            <label htmlFor="demo-input-image" className="btn blue">
              <span>
                <i
                  className="fa fa-plus"
                  style={{fontSize: '22px'}}
                  aria-hidden="true"
                />
              </span>{' '}
              &nbsp; Upload An Invoice
            </label>
            <input
              type="file"
              accept="image/*, application/pdf"
              id="demo-input-image"
              onClick={(event) => (event.target.value = '')}
              onChange={this.onFileChange}
              style={{display: 'none'}}
            />
          </div>
        </div>
        {this.fileData()}
      </React.Fragment>
    );
  }
}

export default withStyles(useStyles)(UploadFile);
