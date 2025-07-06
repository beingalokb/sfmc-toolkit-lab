import React, { useState } from 'react';
import { Box, Stepper, Step, StepLabel, Button, Typography, CircularProgress, Alert } from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

const steps = [
  'Create Data Extension',
  'Create Event Definition',
  'Create Journey'
];

export default function DMWizard() {
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState({
    deId: null,
    eventId: null,
    journeyId: null
  });

  const handleNext = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/create/dm-dataextension', {
        method: 'POST'
      });
      
      const data = await response.json();
      
      if (data.status === 'ERROR') {
        throw new Error(data.message);
      }

      setResults(prev => ({
        ...prev,
        deId: data.deName,
        eventId: data.eventDefinitionId,
        journeyId: data.journeyId
      }));

      setCompleted(prev => ({
        ...prev,
        [activeStep]: true
      }));

      setActiveStep((prevActiveStep) => prevActiveStep + 1);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const getStepContent = (step) => {
    switch (step) {
      case 0:
        return 'Create a Data Extension to store the event data';
      case 1:
        return 'Create an Event Definition that will trigger the journey';
      case 2:
        return 'Create a Journey that uses the Event Definition';
      default:
        return 'Process completed';
    }
  };

  const isStepComplete = (step) => {
    return completed[step];
  };

  const allStepsCompleted = () => {
    return steps.every((_, index) => completed[index]);
  };

  return (
    <Box sx={{ width: '100%', mt: 3, p: 3 }}>
      <Stepper activeStep={activeStep}>
        {steps.map((label, index) => (
          <Step key={label} completed={isStepComplete(index)}>
            <StepLabel
              StepIconComponent={isStepComplete(index) ? CheckCircleIcon : undefined}
            >
              {label}
            </StepLabel>
          </Step>
        ))}
      </Stepper>

      <Box sx={{ mt: 4, mb: 2 }}>
        {allStepsCompleted() ? (
          <Alert severity="success">
            All steps completed successfully!
            <Typography variant="body2" sx={{ mt: 1 }}>
              Data Extension: {results.deId}<br />
              Event Definition: {results.eventId}<br />
              Journey: {results.journeyId}
            </Typography>
          </Alert>
        ) : (
          <Box>
            <Typography sx={{ mt: 2, mb: 1 }}>{getStepContent(activeStep)}</Typography>
            {error && <Alert severity="error" sx={{ mt: 2, mb: 2 }}>{error}</Alert>}
            <Box sx={{ display: 'flex', flexDirection: 'row', pt: 2 }}>
              <Button
                variant="contained"
                onClick={handleNext}
                disabled={loading}
                sx={{ mr: 1 }}
              >
                {loading ? <CircularProgress size={24} /> : 'Create'}
              </Button>
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
}
