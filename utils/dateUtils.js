function formatDate(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function getTodayRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

module.exports = {
  formatDate,
  getTodayRange,
}; 