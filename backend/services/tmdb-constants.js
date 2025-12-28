/**
 * TMDB Constants
 *
 * Genre IDs, Studio IDs, Network IDs, and other constants from TMDB API
 */

// ============ Movie Genres ============
// Using popular movie backdrops for each genre - these are more stable
const MOVIE_GENRES = [
    { id: 28, name: 'Action', backdrop: '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg' },  // John Wick
    { id: 12, name: 'Adventure', backdrop: '/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg' }, // Avatar
    { id: 16, name: 'Animation', backdrop: '/9n2tJBplPbgR2ca05hS5CKXwP2c.jpg' }, // Spider-Verse
    { id: 35, name: 'Comedy', backdrop: '/wqVrANZgCTqSYPZLokPZnbgpbvG.jpg' }, // Barbie
    { id: 80, name: 'Crime', backdrop: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg' },  // Godfather
    { id: 99, name: 'Documentary', backdrop: '/pcDc2WJAYGJTTvRSEIpRZwM3Ola.jpg' }, // Planet Earth
    { id: 18, name: 'Drama', backdrop: '/kXfqcdQKsToO0OUXHcrrNCHDBzO.jpg' },  // Shawshank
    { id: 10751, name: 'Family', backdrop: '/3G1Q5xF40HkUBJXxt2DQgQzKTp5.jpg' }, // Toy Story
    { id: 14, name: 'Fantasy', backdrop: '/s16H6tpK2utvwDtzZ8Qy4qm5Emw.jpg' }, // LOTR
    { id: 36, name: 'History', backdrop: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg' }, // Gladiator
    { id: 27, name: 'Horror', backdrop: '/hZkgoQYus5vegHoetLkCJzb17zJ.jpg' },  // Scream
    { id: 10402, name: 'Music', backdrop: '/zP515KCJYndJPWqgCPwniB6MuwB.jpg' }, // Bohemian Rhapsody
    { id: 9648, name: 'Mystery', backdrop: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg' }, // Knives Out
    { id: 10749, name: 'Romance', backdrop: '/yDHYTfA3R0jFYba16jBB1ef8oIt.jpg' }, // Titanic
    { id: 878, name: 'Science Fiction', backdrop: '/p1F51Lvj3sMopG948F5HsBbl43C.jpg' }, // Interstellar
    { id: 10770, name: 'TV Movie', backdrop: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg' },
    { id: 53, name: 'Thriller', backdrop: '/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg' }, // Se7en
    { id: 10752, name: 'War', backdrop: '/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg' }, // Dunkirk
    { id: 37, name: 'Western', backdrop: '/suaEOtk1N1sgg2MTM7oZd2cfVp3.jpg' }  // Django
];

// ============ TV Genres ============
const TV_GENRES = [
    { id: 10759, name: 'Action & Adventure', backdrop: '/4O4AGbGWAqrOdS0eYaMhyK5hK7k.jpg' },
    { id: 16, name: 'Animation', backdrop: '/eVCi0jwx1C97iHtOIL5Vj3oSPh9.jpg' },
    { id: 35, name: 'Comedy', backdrop: '/hrzI2qJWECM11IWMHzVwGIwZLgR.jpg' },
    { id: 80, name: 'Crime', backdrop: '/7x2K3B2YbXOXdvOcInFpyICNIrb.jpg' },
    { id: 99, name: 'Documentary', backdrop: '/3fPZTqCXm4L9h4Tg8K1BjqAa3DG.jpg' },
    { id: 18, name: 'Drama', backdrop: '/3IBaU4ZWz3DWLbvUGTNZJrkeI4l.jpg' },
    { id: 10751, name: 'Family', backdrop: '/hziiv14OpD73u9gAak4XDDfBKa2.jpg' },
    { id: 10762, name: 'Kids', backdrop: '/eVCi0jwx1C97iHtOIL5Vj3oSPh9.jpg' },
    { id: 9648, name: 'Mystery', backdrop: '/eLL8jfg3dIEQdPh3Mx8BYqYLCif.jpg' },
    { id: 10763, name: 'News', backdrop: '/1iBs3QBFHK9AEAr89rUQRbA3mEB.jpg' },
    { id: 10764, name: 'Reality', backdrop: '/tPy1o1R53lFD2rNDjfPU4AJZcFm.jpg' },
    { id: 10765, name: 'Sci-Fi & Fantasy', backdrop: '/3V4kLQg0kSqPLctI5ziYWabAZYF.jpg' },
    { id: 10766, name: 'Soap', backdrop: '/tEdjPXPPPHHWsVQoRQoqGmfj8NJ.jpg' },
    { id: 10767, name: 'Talk', backdrop: '/aXf3rOEP1SkSQrqj5vcwxKSPjxb.jpg' },
    { id: 10768, name: 'War & Politics', backdrop: '/gQtOqbFbX5mF4dR00eAR1aLcPcJ.jpg' },
    { id: 37, name: 'Western', backdrop: '/kqjL17yufvn9OVLyXYpvtyrFfak.jpg' }
];

// ============ Studios (Production Companies) ============
const STUDIOS = [
    { id: 2, name: 'Walt Disney Pictures', logo: '/wdrCwmRnLFJhEoH8GSfymY85KHT.png' },
    { id: 25, name: '20th Century Studios', logo: '/qZCc1lty5FzX30aOCVRBLzaVmcp.png' },
    { id: 34, name: 'Sony Pictures', logo: '/GagSvqWlyPdkFHMfQ3pNq6ix9P.png' },
    { id: 174, name: 'Warner Bros. Pictures', logo: '/IuAlhI9eVC9Z8UQWOIDdWRKSEJ.png' },
    { id: 33, name: 'Universal Pictures', logo: '/8lvHyhjr8oUKOOy2dKXoALWKdp0.png' },
    { id: 4, name: 'Paramount Pictures', logo: '/gz66EfNoYPqHTYI4q9UEN4CbHRc.png' },
    { id: 3, name: 'Pixar', logo: '/1TjvGVDMYsj6JBxOAkUHpPEwLf7.png' },
    { id: 521, name: 'DreamWorks Animation', logo: '/kP7t6RwGz2AvvTkvnI1uteEwHet.png' },
    { id: 420, name: 'Marvel Studios', logo: '/hUzeosd33nzE5MCNsZxCGEKTXaQ.png' },
    { id: 7505, name: 'Marvel Entertainment', logo: '/5dOzNpNBbqv8hYvgFaPg8v4e2nV.png' },
    { id: 429, name: 'DC Entertainment', logo: '/2Tc1P3Ac8M479naPp1kYT3izLS5.png' },
    { id: 1632, name: 'Lionsgate', logo: '/cisLn1YAUptscKOu1eD1sfWsP5r.png' },
    { id: 21, name: 'Metro-Goldwyn-Mayer', logo: '/usUnaYV6hQnlVAXP6r4HwrlLFPG.png' },
    { id: 1, name: 'Lucasfilm Ltd.', logo: '/o86DbpburjxrqAzEDhXZcyE8pDb.png' },
    { id: 7, name: 'DreamWorks Pictures', logo: '/vru2SssLX3FPhnKZGtYw00pVIS9.png' },
    { id: 47, name: 'New Line Cinema', logo: '/9aotxauvc9685tq9pTcRJszuT06.png' }
];

// ============ TV Networks ============
const NETWORKS = [
    { id: 213, name: 'Netflix', logo: '/wwemzKWzjKYJFfCeiB57q3r4Bcm.png' },
    { id: 2739, name: 'Disney+', logo: '/gJ8VX6JSu3ciXHuC2dDGAo2lvwM.png' },
    { id: 1024, name: 'Amazon', logo: '/ifhbNuuVnlwYy5oXA5VIb2YR8AZ.png' },  // Prime Video
    { id: 2552, name: 'Apple TV+', logo: '/4KAy34EHvRM25Ih8wb82AuGU7zJ.png' },
    { id: 453, name: 'Hulu', logo: '/zxgSLwL4R0BPPkmtAnKa4O4w8EV.png' },
    { id: 49, name: 'HBO', logo: '/tuomPhY2UtuPTqqFnKMVHvSb724.png' },
    { id: 2087, name: 'Discovery+', logo: '/uIp1VuQqPQgp6B74d9JEgLaIVze.png' },
    { id: 2, name: 'ABC', logo: '/ndAvF4JLsliGreX87jAc9GdjmJY.png' },
    { id: 6, name: 'NBC', logo: '/o3OedEP0f9mfZr33jz2BfXOUK5.png' },
    { id: 16, name: 'CBS', logo: '/nm8d7P7MJNiBLdgIzUK0gkuEA4r.png' },
    { id: 19, name: 'FOX', logo: '/1DSpHrWyOORkL9N2QHX7Adt31mQ.png' },
    { id: 65, name: 'Showtime', logo: '/6TXhCY0ybhfhPbdS3aAaYLu3kDQ.png' },
    { id: 67, name: 'Showtime', logo: '/6TXhCY0ybhfhPbdS3aAaYLu3kDQ.png' },
    { id: 174, name: 'AMC', logo: '/pmvRmATOCaDykE6JrVoeYxlFHw3.png' },
    { id: 41, name: 'TNT', logo: '/5WQ29egVHqdFaIaGqu38ZgWXPwW.png' },
    { id: 77, name: 'Syfy', logo: '/yiKxm0zhqSU4vDyOe4P0WvZPwwA.png' },
    { id: 318, name: 'Starz', logo: '/sIQh1qjj0cZ8XdOvHiOdnGJ6A2t.png' },
    { id: 84, name: 'FX', logo: '/tpFPWNO9dNWxU3TYlVq5kqmOJbB.png' },
    { id: 928, name: 'Adult Swim', logo: '/lQl0A5YGGZ0mKn1vUmhcWHzrg1p.png' },
    { id: 1709, name: 'Peacock', logo: '/8OERWfYZI0R7hJc1WfFtKlGTrRW.png' },
    { id: 4330, name: 'Paramount+', logo: '/fi83B1oztoS47xxcemFdPBCd8IO.png' }
];

// TMDB Image URLs
const IMAGE_SIZES = {
    poster: {
        w92: 'w92',
        w154: 'w154',
        w185: 'w185',
        w342: 'w342',
        w500: 'w500',
        w780: 'w780',
        original: 'original'
    },
    backdrop: {
        w300: 'w300',
        w780: 'w780',
        w1280: 'w1280',
        original: 'original'
    },
    logo: {
        w45: 'w45',
        w92: 'w92',
        w154: 'w154',
        w185: 'w185',
        w300: 'w300',
        w500: 'w500',
        original: 'original'
    }
};

module.exports = {
    MOVIE_GENRES,
    TV_GENRES,
    STUDIOS,
    NETWORKS,
    IMAGE_SIZES
};
