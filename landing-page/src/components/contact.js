import Box from '@mui/material/Box';
import Progress from '@mui/material/CircularProgress';
import Container from '@mui/material/Container';
import React, {useState} from 'react';
// import Alert from '@mui/lab/Alert';

const styles = {
  root: {
    '&:after': {
      content: '" "',
      display: 'table',
    },
  },
  contactBox: {
    position: 'relative',
    zIndex: 5,
    padding: '50px 0',
    marginBottom: '150px',
    // background: 'linear-gradient(120deg, #485dce, #75b1db)',
    background: '#485dce',
  },
  contactForm: {
    backgroundColor: '#fff',
    margin: '0 auto',
    padding: '30px',
    borderRadius: '4px',
    boxShadow: '0 2px 8px 0 rgba(60, 64, 67, 0.2)',
    marginBottom: '-200px',
  },
  heading: {
    fontSize: 24,
    fontWeight: 'bold',
    margin: 0,
    '@media (min-width:900px)': {
      fontSize: 32,
    },
  },
  fieldGroup: {
    display: 'flex',
    flexWrap: 'wrap',
    margin: '0 -12px',
  },
  field: {
    flexGrow: 1,
    padding: '12px',
    display: 'grid',
  },
  label: {
    display: 'inline-block',
    textTransform: 'uppercase',
    fontSize: 12,
    marginBottom: '4px',
    color: '#73879c',
  },
  textarea: {
    display: 'block',
    width: '100%',
    padding: '10px',
    fontSize: 16,
    outline: 0,
    borderRadius: '4px',
    border: '1px solid #dde',
    resize: 'none',
    font: 'inherit',
    background: '#f9f9f9',
  },
};

export default function Contact() {
  const [status, setstatus] = useState('');

  function sendRequest(event) {
    event.preventDefault();
    if (status === 'progress') return;

    const formData = new FormData(event.target);

    const payload = {};
    payload.page = window.location.href;
    for (const key of formData.keys()) {
      payload[key] = formData.get(key);
    }

    setstatus('progress');
    fetch('https://hooks.zapier.com/hooks/catch/4636052/o5fz1hb/', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error('An error occured!'))
      )
      .then(() => {
        window.localStorage.setItem('email', formData.get('email'));
        document.write();
        window.location.href = '/thank-you/';
      })
      .catch(() => {
        setstatus('error');
      });
  }

  return (
    <Box sx={styles.root} id="contact">
      <Box sx={styles.contactBox}>
        <Container>
          <div style={{color: '#fff'}}>
            <Box component="p" sx={styles.heading}>
              Get in touch - start your free trial today!
            </Box>
            <p style={{marginBottom: 50}}>
              Reach out for any questions on our Enterprise Plan, pricing, or
              security. Chat with an enterprise collaboration specialist
            </p>
          </div>
          <Box component="form" sx={styles.contactForm} onSubmit={sendRequest}>
            <p style={{fontSize: 24, margin: '0 0 20px'}}>Have a query?</p>
            <Box sx={styles.fieldGroup}>
              <Box sx={styles.field}>
                <Box component="span" sx={styles.label}>
                  Name
                </Box>
                <input
                  type="text"
                  name="name"
                  className="inputText"
                  placeholder="John doe"
                  required
                />
              </Box>
              <Box sx={styles.field}>
                <Box component="span" sx={styles.label}>
                  Email
                </Box>
                <input
                  type="email"
                  name="email"
                  id="email"
                  className="inputText"
                  placeholder="name@company.com"
                  required
                />
              </Box>
              <Box sx={styles.field}>
                <Box component="span" sx={styles.label}>
                  Company
                </Box>
                <input
                  type="text"
                  name="company"
                  className="inputText"
                  placeholder="Tyrell Corp."
                  required
                />
              </Box>
            </Box>
            <Box sx={styles.fieldGroup}>
              <Box sx={styles.field}>
                <Box component="span" sx={styles.label}>
                  Describe your Requirements{' '}
                </Box>
                <Box
                  component="textarea"
                  sx={styles.textarea}
                  name="message"
                  placeholder="Describe your Requirements"
                  rows="4"
                  minLength="50"
                  // onInvalid={(event) => event.target.setCustomValidity('Please enter atleast 50 characters to better describe your requirements.')}
                  // onInput={(event) => event.target.setCustomValidity(' ')}
                  required
                />
              </Box>
            </Box>
            <Box sx={styles.fieldGroup}>
              <div style={{padding: 12}}>
                <div>
                  <button type="submit" className="btn blue">
                    {status === 'progress' ? (
                      <Progress color="#fff" size={25} />
                    ) : (
                      'Send Query'
                    )}
                  </button>
                </div>
              </div>
              {status === 'error' && (
                <div style={{padding: 12}}>
                  {/* <Alert severity="error">An error occured while sending request.</Alert> */}
                </div>
              )}
            </Box>
          </Box>
        </Container>
      </Box>
    </Box>
  );
}
