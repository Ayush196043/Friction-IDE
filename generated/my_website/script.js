document.addEventListener('DOMContentLoaded', () => {
    // GSAP animation for the report container on load
    gsap.from('.report-container', {
        duration: 1.2,
        y: 50,
        opacity: 0,
        ease: 'power3.out'
    });

    // Optional: Animate sections as they come into view
    // This requires ScrollTrigger plugin for GSAP
    // gsap.registerPlugin(ScrollTrigger);

    // gsap.utils.toArray('.report-section').forEach(section => {
    //     gsap.from(section, {
    //         duration: 0.8,
    //         y: 30,
    //         opacity: 0,
    //         ease: 'power2.out',
    //         scrollTrigger: {
    //             trigger: section,
    //             start: 'top 85%', // When top of section is 85% down from viewport top
    //             end: 'bottom 20%',
    //             toggleActions: 'play none none none' // Play animation once
    //         }
    //     });
    // });
});