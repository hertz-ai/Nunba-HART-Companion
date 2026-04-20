import Button from '@mui/material/Button';
import {purple} from '@mui/material/colors';
import {createTheme} from '@mui/material/styles';
import {styled} from '@mui/material/styles';

export const authTheme = createTheme({
  palette: {
    primary: {main: '#0078ff'},
    secondary: {main: '#00e89d'},
  },
});

export const ColorButton = styled(Button)({
  color: '#fff',
  background: 'linear-gradient(to right, #00e89d, #0078ff)',
  '&:hover': {backgroundColor: purple[700]},
  '&:focus': {outline: 'none'},
});
